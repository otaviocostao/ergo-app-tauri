# Planejamento Técnico: Monitoramento e Análise de Cadência de Digitação no Backend Rust

Este documento define a arquitetura, as garantias de desempenho e privacidade, a modelagem de dados e o roteiro passo a passo para implementar o monitoramento global de cadência de teclas no backend Rust do **Ergo**, integrando-o ao ciclo de vida das sessões de monitoramento postural e à página `Monitoring.tsx`.

---

## 1. Diagnóstico Atual e Objetivos da Arquitetura

### 1.1 Limitações da Implementação Atual no Frontend

Atualmente, o componente `src/components/monitoring/KeyboardMonitorCard.tsx` (renderizado em `src/pages/Monitoring.tsx:L336-L348`) possui limitações estruturais por operar exclusivamente na camada React/WebView:

1. **Escopo restrito ao foco da janela (`window.addEventListener("keydown")`)**: O navegador só recebe eventos de teclado quando a janela do Ergo está em primeiro plano e com foco ativo. Quando o usuário trabalha em outros aplicativos (IDE, navegador, editor de texto) ou quando o Ergo está minimizado/na bandeja do sistema, nenhuma tecla é contabilizada.
2. **Throttling de timers em segundo plano**: Quando a janela é minimizada ou ocultada na bandeja do sistema (`src-tauri/src/system_tray.rs` via `window.hide()`), o WebView2 reduz drasticamente a frequência de `setInterval`, comprometendo janelas de cálculo baseadas no frontend.
3. **Estado efêmero e valores simulados**: `continuousMinutes` inicia com o valor fixo `14` (`useState(14)`), não há detecção automática de pausa regenerativa e todo o estado se perde ao desmontar o componente.
4. **Ausência de persistência**: Nenhuma janela consolidada de 60 segundos é persistida no SQLite para histórico ou correlação ergonômica.

### 1.2 Mapeamento dos Princípios de Projeto

| Princípio | Solução Arquitetural Adotada |
| :--- | :--- |
| **1. Zero impacto no uso do dispositivo** | Captura assíncrona no SO (Win32 Raw Input `WM_INPUT` + `RIDEV_INPUTSINK` fora da cadeia bloqueante de hooks) combinada com incremento atômico *lock-free* (`AtomicU32::fetch_add` com `Ordering::Relaxed`, ~5 ns, zero alocação, zero `Mutex` no evento de tecla). |
| **2. Funcionamento aberto, minimizado ou na bandeja** | Duas threads nativas leves em Rust gerenciadas pelo `AppHandle` (seguindo o padrão de `reminder_scheduler_service.rs`): continuam executando normalmente mesmo com `window.hide()` (bandeja) ou janela minimizada, independentes de timers do WebView. |
| **3. Log em snapshots de 60s no banco** | Nova entidade em camadas (`TypingMetricSnapshot` -> Repository -> Service -> Command) persistindo janelas agregadas de 60s na tabela `typing_metrics_snapshots` dentro da migration única `0001_initial_migration.sql`. |
| **4. Início conjunto e compartilhamento de `MonitoringSession`** | Reutilização da mesma `MonitoringSession` (`monitoring_sessions.id`) como chave estrangeira (`session_id`) de `typing_metrics_snapshots`, sincronizada com o início, pausa e encerramento do monitoramento postural. |
| **5. Privacidade estrita (sem salvar teclas)** | Descarte imediato do código da tecla na *stack* do listener após filtrar modificadores e auto-repetição. Nem caracteres, nem códigos virtuais (`VK_*`), nem tempos inter-teclas em milissegundos (*IKT*) são retidos em RAM ou salvos no SQLite. |
| **6. Exibição em tempo real em `Monitoring.tsx`** | Emissão de eventos Tauri (`typing-metrics-updated`) + comando de leitura de estado atual (`get_live_typing_metrics`), consumidos por um hook `useTypingMetrics` em `Monitoring.tsx` e repassados via *props* ao `KeyboardMonitorCard.tsx`. |

---

## 2. Arquitetura de Captura Global e Processamento em Rust

### 2.1 Comparativo de Estratégias de Captura Global no Sistema Operacional

Para atender rigorosamente ao **Princípio 1** (zero impacto/latência na digitação do usuário em outros softwares), a escolha da API de captura no Rust é determinante:

| Critério | Opção A (Recomendada - Windows): Win32 Raw Input (`WM_INPUT` + `RIDEV_INPUTSINK`) via `windows-sys` | Opção B (Alternativa Multiplataforma): Low-Level Hook via crate `rdev` (`WH_KEYBOARD_LL` / `CGEventTap` / `XI2`) |
| :--- | :--- | :--- |
| **Impacto na digitação do usuário** | **Zero absoluto**. O Windows entrega mensagens `WM_INPUT` de forma **assíncrona** para uma janela invisível (`HWND_MESSAGE`) *após* o aplicativo de destino já ter recebido a tecla. Jamais atrasa ou bloqueia o teclado do sistema. | **Baixo, porém síncrono na cadeia de hooks**. No Windows, `WH_KEYBOARD_LL` intercepta a tecla *antes* da entrega ao app alvo. Se a thread sofrer atraso de escalonamento, pode introduzir micro-latência ou sofrer *silent unhook* pelo Windows (`LowLevelHooksTimeout`). |
| **Peso de dependências e Build** | **Mínimo**. `windows-sys` contém apenas declarações FFI *zero-cost* para DLLs nativas do próprio Windows (`user32.dll`), sem compilar C++. | **Leve**, mas adiciona dependências de terceiros para cada SO. |
| **Funcionamento em Background / Tray** | **Total**. `RIDEV_INPUTSINK` captura eventos mesmo com a janela principal oculta (`window.hide()`) ou minimizada. | **Total**. Opera globalmente na sessão de desktop do usuário. |

> **Decisão Arquitetural Recomendada:**  
> Definir uma abstração interna enxuta no serviço Rust (`KeyboardInputListener`) utilizando **Win32 Raw Input (`RegisterRawInputDevices` com `RIDEV_INPUTSINK` em `HWND_MESSAGE` via `windows-sys`)** no Windows (`#[cfg(target_os = "windows")]`), mantendo um fallback condicional (`#[cfg(not(target_os = "windows"))]`) com `rdev` caso o projeto seja compilado para Linux/macOS. Em ambos os casos, o callback executa **apenas operações em memória local da stack e um único `AtomicU32::fetch_add(1, Ordering::Relaxed)`**.

### 2.2 Fluxo Arquitetural Completo

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ SISTEMA OPERACIONAL (Qualquer janela em foco; Ergo aberto, minimizado ou na bandeja)     │
└────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                             │ Evento físico de teclado (WM_INPUT)
                                             ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ BACKEND RUST (`src-tauri/src/`)                                                          │
│                                                                                          │
│  1. Thread Listener (`typing-input-listener`)                                            │
│     ├── Filtra KeyUp e auto-repetição (bitmask local [u64; 4] de teclas pressionadas)    │
│     ├── Ignora modificadores puros (Shift, Ctrl, Alt, Win/Meta, CapsLock)                │
│     ├── DESCARTA imediatamente o código da tecla (nunca sai do escopo da função)         │
│     └── Se `capture_enabled == true`: `pending_keystrokes.fetch_add(1, Relaxed)`         │
│                                            │ (Lock-Free AtomicU32 — ~5 nanossegundos)    │
│                                            ▼                                             │
│  2. Thread Agregadora (`typing-monitor-worker` — Tick de 1s via std::thread::sleep)      │
│     ├── Consome `pending_keystrokes.swap(0, Relaxed)`                                    │
│     ├── Verifica `AuthState` + `settings_service::is_module_enabled(TypingAnalysis)`     │
│     ├── Atualiza Ring Buffer fixo de 60 buckets de 1s (`[u32; 60]` = 240 bytes em RAM)   │
│     ├── Calcula métricas em tempo real (CPM móvel, uso contínuo, pausas, status)         │
│     ├── Emite evento IPC `"typing-metrics-updated"` (apenas quando houver alteração)     │
│     └── A cada 60s de janela ativa na `MonitoringSession`:                               │
│           └── Chama `typing_metric_snapshot_service::record_typing_snapshot(&conn, ...)` │
│                       │                                                                  │
│                       ▼                                                                  │
│  3. Camadas de Domínio e Persistência                                                    │
│     Commands (`commands/typing_metric_snapshot.rs`)                                      │
│        └──> Services (`services/typing_metric_snapshot_service.rs`)                      │
│               └──> Repositories (`repositories/typing_metric_snapshot_repository.rs`)    │
│                      └──> SQLite (`monitoring_sessions` 1 ───< N `typing_metrics_snapshots`)
└────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                             │ Tauri Event + Invoke (`get_live_typing_metrics`)
                                             ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND REACT (`src/`)                                                                  │
│  `Monitoring.tsx` -> `useTypingMetrics()` -> `<KeyboardMonitorCard metrics={...} />`     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Privacidade por Design (LGPD / RN-07 e Princípio 5)

Para garantir que o aplicativo **jamais atue ou possa ser auditado como um keylogger**, cinco barreiras técnicas são impostas:

1. **Descarte imediato na Stack**: O identificador da tecla (`VKey`) é lido exclusivamente em variáveis locais na pilha da thread `typing-input-listener` para duas checagens booleanas:
   - Ignorar teclas modificadoras (`VK_SHIFT`, `VK_LSHIFT`, `VK_RSHIFT`, `VK_CONTROL`, `VK_LCONTROL`, `VK_RCONTROL`, `VK_MENU`, `VK_LMENU`, `VK_RMENU`, `VK_LWIN`, `VK_RWIN`, `VK_CAPITAL`), mantendo paridade com o filtro atual de `KeyboardMonitorCard.tsx`.
   - Ignorar auto-repetição do sistema operacional quando o usuário segura uma tecla pressionada (usando um *bitset* local `[u64; 4]` de 32 bytes na própria thread do listener: marca `1` no `KeyDown`, ignora novos `KeyDown` enquanto `1`, limpa para `0` no `KeyUp`). Isso impede que segurar `Espaço` ou `Backspace` infle artificialmente a cadência para > 1.000 CPM.
2. **Fronteira Atômica Cega (`AtomicU32`)**: O único dado compartilhado entre a thread de captura e o restante do programa é um contador inteiro sem sinal (`AtomicU32`). É estruturalmente impossível reconstruir palavras, atalhos ou senhas a partir de um inteiro acumulado por segundo.
3. **Ausência de *Inter-Keystroke Timing* (`IKT`)**: Diferente de sistemas que gravam o `timestamp` em milissegundos de cada tecla individual (que na literatura de segurança pode vazar padrões biométricos de digitação), o agregador agrupa contagens em **buckets inteiros de 1 segundo (`[u32; 60]`)**.
4. **Zero captura de contexto de janelas**: O backend não consulta o título da janela ativa (`GetForegroundWindow` / `GetWindowText`).
5. **Bloqueio por Módulo (`RN-14`)**: Quando `typing_analysis` está desativado em `settings`, a flag atômica `capture_enabled` permanece `false`, de modo que nem mesmo o contador em memória é incrementado.

---

## 4. Compartilhamento de `MonitoringSession` e Modelagem das Métricas

### 4.1 Compartilhar `MonitoringSession` é uma Boa Prática? (Princípio 4)

**Sim, é a abordagem arquitetural recomendada**, desde que combinada com uma tabela de snapshots própria (`typing_metrics_snapshots`) referenciando `monitoring_sessions(id)`:

- **Por que compartilhar `monitoring_sessions`?**
  - Uma `MonitoringSession` representa uma jornada de trabalho monitorada do usuário (`user_id`, `started_at`, `ended_at`, `duration_seconds`).
  - Vincular `posture_metrics_snapshots.session_id` e `typing_metrics_snapshots.session_id` à mesma `monitoring_sessions.id` permite cruzar dados temporais nos relatórios (ex.: verificar se picos de digitação acima de 250 CPM coincidem com inclinação cervical `danger` ou queda na taxa de piscadas), além de manter integridade referencial automática (`ON DELETE CASCADE`).
  - Preserva `src-tauri/src/models/monitoring_session.rs` **sem quebrar nenhum contrato ou teste existente**.

- **Por que criar `typing_metrics_snapshots` separada de `posture_metrics_snapshots` (Princípio da Responsabilidade Única)?**
  - A captura postural por câmera pausa e descarta janelas incompletas quando o usuário está parcialmente ocluído (`PARTIALLY_OCCLUDED`), sem calibração, com a câmera ocupada por videoconferência (Teams/Meet/Zoom) ou com o vídeo suspenso.
  - Já a digitação **continua ocorrendo** justamente durante reuniões no Teams/Zoom ou quando o Ergo está minimizado/na bandeja do sistema. Se as métricas de teclado fossem apenas colunas extras em `posture_metrics_snapshots`, todo o histórico de digitação seria perdido sempre que a webcam pausasse.

### 4.2 Sincronismo de Ciclo de Vida (Postura + Teclado + Bandeja)

1. **Início conjunto**: Quando o monitoramento inicia em `Monitoring.tsx` (`start_monitoring_session`), a sessão ativa (`session.id`) é registrada no `TypingMonitorState` do Rust.
   - *Nota sobre módulos independentes*: Caso o usuário desative `postural_analysis` mas mantenha `typing_analysis` ativo em **Configurações → Módulos**, recomenda-se ajustar a condição de abertura de sessão em `Monitoring.tsx` de `posturalEnabled` para `(posturalEnabled || typingEnabled)`. Assim, ambos compartilham a mesma sessão quando ativos juntos, e a digitação também consegue registrar logs caso a câmera esteja desativada pelo usuário.
2. **Pausa e Calibração**:
   - Clicar em **Pausar Monitoramento** (`!isMonitoring`) ou abrir o **Modal de Calibração** (`isCalibrationOpen`) pausa tanto a agregação postural quanto o `typing_monitor_service`.
   - Em contrapartida, eventos exclusivos de câmera (`userPresence !== "ACTIVE"` ou `isHardwareBusy` por uso em videoconferência) pausam **apenas** a câmera, mantendo o monitoramento de teclado operante.
3. **Minimizado, Bandeja do Sistema e Navegação Interna**:
   - Ao minimizar ou fechar para a bandeja (`system_tray.rs` intercepta `CloseRequested` e executa `window.hide()`), a sessão permanece aberta e o worker Rust continua salvando snapshots de 60s no SQLite.
   - *Atenção à navegação interna de rotas*: Atualmente, `useMetricRecording` vive dentro da página `Monitoring.tsx`. Se o usuário navegar de `/monitoring` para `/reports` ou `/reminders`, o `useEffect` de desmontagem encerraria a sessão. Para que o monitoramento continue também durante a navegação entre abas internas do app (além de minimizado/bandeja), recomenda-se elevar o provedor de sessão de monitoramento (`MonitoringSessionProvider`) para `src/components/MainLayout.tsx` (detalhado no Passo 8).
4. **Encerramento limpo**: Ao pausar/encerrar a sessão (`end_monitoring_session`), fazer `logout` ou sair do aplicativo pelo menu da bandeja (`"tray-quit"` -> `RunEvent::Exit`), o worker Rust descarta/finaliza o estado atual e interrompe as threads com segurança.

### 4.3 Métricas Definidas para a Snapshot de 60s (Princípios 3 e 5)

Além da quantidade de teclas e da cadência média solicitadas, propomos 4 métricas ergonômicas derivadas exclusivamente dos buckets anônimos de 1 segundo:

| Coluna SQL / Campo Rust | Tipo | Descrição e Justificativa Ergonômica |
| :--- | :--- | :--- |
| `id` | `TEXT` / `String` | UUID v4 único da snapshot. |
| `session_id` | `TEXT` / `String` | FK para `monitoring_sessions(id) ON DELETE CASCADE`. |
| `timestamp` | `TEXT` / `String` | Instante UTC (RFC 3339) de fechamento da janela de 60s. |
| `window_duration_seconds` | `INTEGER` / `i64` | Escopo de duração da janela em segundos (padrão `60`). |
| `keystrokes_count` | `INTEGER` / `i64` | **Quantidade total de teclas válidas pressionadas** na janela. |
| `cadence_cpm` | `REAL` / `f64` | **Cadência média** no período em teclas por minuto: `(keystrokes_count / window_duration_seconds) * 60.0`. |
| `peak_cpm` | `REAL` / `f64` | **Cadência de pico (rajada de 5s)**: maior soma em janela deslizante de 5s multiplicada por `12.0`. Identifica sobrecarga aguda nos tendões flexores mesmo quando a média do minuto parece baixa. |
| `active_typing_seconds` | `INTEGER` / `i64` | Quantidade de segundos (`0..=60`) em que houve ao menos 1 tecla pressionada. Diferencia digitação ininterrupta de digitação espaçada. |
| `micro_pauses_count` | `INTEGER` / `i64` | Quantidade de micro-pausas espontâneas ($\ge 3\text{s}$ consecutivos sem digitar após atividade) dentro da janela de 60s. Indicador de recuperação fisiológica muscular. |
| `continuous_typing_minutes` | `INTEGER` / `i64` | Minutos consecutivos acumulados de atividade de digitação (> 5 teclas/min) sem pausa regenerativa ($\ge 2\text{ min}$ ociosos). |
| `dominant_status` | `TEXT` / `TypingStatus` | Classificação ergonômica do minuto: `"good"` (< 15 min contínuos), `"warning"` (15 a 24 min) ou `"danger"` ($\ge 25$ min), alinhada ao `KeyboardMonitorCard.tsx`. |
| `created_at` | `TEXT` / `Option<String>` | Timestamp de gravação no banco. |

---

## 5. Passo a Passo de Implementação

Todo o código backend deve seguir estritamente as convenções do projeto (`.agents/skills/backend-model-development/SKILL.md`): **arquitetura em 4 camadas**, **código 100% em inglês**, serialização `#[serde(rename_all = "camelCase")]` e **manutenção da migration única**.

---

### Passo 1: Dependências no `src-tauri/Cargo.toml`

Adicionar `windows-sys` (apenas para targets Windows) com as features mínimas para Raw Input e loop de mensagens em janela invisível (`HWND_MESSAGE`):

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows-sys = { version = "0.59", features = [
    "Win32_Foundation",
    "Win32_System_LibraryLoader",
    "Win32_UI_Input",
    "Win32_UI_Input_KeyboardAndMouse",
    "Win32_UI_WindowsAndMessaging",
] }
```

*(Opcional: caso deseje suporte imediato a Linux/macOS no mesmo build, adicionar `[target.'cfg(not(target_os = "windows"))'.dependencies] rdev = "0.5"`).*

---

### Passo 2: Schema na Migration Única (`src-tauri/migrations/0001_initial_migration.sql`)

Seguindo a regra de **migration única** do projeto (**não criar `0002_*.sql`**), declarar a tabela `typing_metrics_snapshots` e seus índices logo após `posture_metrics_snapshots` (garantindo que `monitoring_sessions` já tenha sido criada antes):

```sql
CREATE TABLE IF NOT EXISTS typing_metrics_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    window_duration_seconds INTEGER NOT NULL DEFAULT 60,
    keystrokes_count INTEGER NOT NULL DEFAULT 0,
    cadence_cpm REAL NOT NULL DEFAULT 0.0,
    peak_cpm REAL NOT NULL DEFAULT 0.0,
    active_typing_seconds INTEGER NOT NULL DEFAULT 0,
    micro_pauses_count INTEGER NOT NULL DEFAULT 0,
    continuous_typing_minutes INTEGER NOT NULL DEFAULT 0,
    dominant_status TEXT NOT NULL CHECK (dominant_status IN ('good', 'warning', 'danger')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (session_id) REFERENCES monitoring_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_typing_metrics_snapshots_session_id ON typing_metrics_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_typing_metrics_snapshots_timestamp ON typing_metrics_snapshots(timestamp);
```

> **Nota prática de desenvolvimento (`sqlx::migrate!`)**: Como o `sqlx` valida o checksum SHA-384 de `0001_initial_migration.sql` na tabela `_sqlx_migrations`, ao alterar a migration única durante o desenvolvimento local, apague ou recrie o arquivo local `ergo.db` no diretório `AppData` da máquina de desenvolvimento antes de iniciar o app pela primeira vez com a nova tabela.

---

### Passo 3: Camada de Model (`src-tauri/src/models/typing_metric_snapshot.rs`)

1. Criar `src-tauri/src/models/typing_metric_snapshot.rs` contendo:
   - Enum `TypingStatus` (`Good`, `Warning`, `Danger`) com `#[serde(rename_all = "lowercase")]`, implementando `Display`, `FromStr`, `rusqlite::ToSql` e `rusqlite::types::FromSql` (mesmo padrão de `PostureStatus` em `src-tauri/src/models/posture_metric_snapshot.rs` — ou extraindo/reutilizando caso prefira evitar duplicação).
   - `TypingMetricSnapshot`: entidade persistida no SQLite com `#[serde(rename_all = "camelCase")]`.
   - `CreateTypingSnapshotPayload`: DTO de criação para o serviço/repositório.
   - `TypingSnapshotHistoryFilter`: filtro por `session_id`, `start_time`, `end_time` e `limit`.
   - `LiveTypingMetrics`: DTO de telemetria em tempo real emitido via evento Tauri e retornado para `Monitoring.tsx`:
     ```rust
     #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
     #[serde(rename_all = "camelCase")]
     pub struct LiveTypingMetrics {
         pub session_id: Option<String>,
         pub is_monitoring_active: bool,
         pub is_typing: bool,
         pub cpm: i64,
         pub peak_cpm: f64,
         pub total_keystrokes: i64,
         pub continuous_minutes: i64,
         pub dominant_status: TypingStatus,
     }
     ```
2. Registrar `pub mod typing_metric_snapshot;` em `src-tauri/src/models/mod.rs`.

---

### Passo 4: Camada de Repositório (`src-tauri/src/repositories/typing_metric_snapshot_repository.rs`)

1. Criar `src-tauri/src/repositories/typing_metric_snapshot_repository.rs` espelhando o padrão de `posture_metric_snapshot_repository.rs`:
   - Declarar `pub const SELECT_TYPING_SNAPSHOT_FIELDS: &str = "id, session_id, timestamp, window_duration_seconds, keystrokes_count, cadence_cpm, peak_cpm, active_typing_seconds, micro_pauses_count, continuous_typing_minutes, dominant_status, created_at";`.
   - Implementar `pub fn map_typing_snapshot_row(row: &rusqlite::Row<'_>) -> Result<TypingMetricSnapshot, rusqlite::Error>`.
   - Implementar as operações SQL puras:
     - `insert(conn: &Connection, snapshot: &TypingMetricSnapshot) -> Result<(), rusqlite::Error>`
     - `insert_batch(conn: &Connection, snapshots: &[TypingMetricSnapshot]) -> Result<(), rusqlite::Error>`
     - `find_by_id(conn: &Connection, id: &str) -> Result<Option<TypingMetricSnapshot>, rusqlite::Error>`
     - `find_all_by_session_id(conn: &Connection, session_id: &str) -> Result<Vec<TypingMetricSnapshot>, rusqlite::Error>`
     - `find_history(conn: &Connection, filter: &TypingSnapshotHistoryFilter) -> Result<Vec<TypingMetricSnapshot>, rusqlite::Error>`
     - `delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error>`
2. Registrar `pub mod typing_metric_snapshot_repository;` em `src-tauri/src/repositories/mod.rs`.

---

### Passo 5: Camada de Serviço de Persistência (`src-tauri/src/services/typing_metric_snapshot_service.rs`)

1. Criar `src-tauri/src/services/typing_metric_snapshot_service.rs` com:
   - `validate_typing_snapshot_payload(conn: &Connection, payload: &CreateTypingSnapshotPayload) -> Result<(), String>`:
     - Validar que `session_id` não está vazio e existe em `monitoring_session_repository::find_by_id`.
     - Validar `window_duration_seconds > 0`.
     - Validar `keystrokes_count >= 0`, `active_typing_seconds >= 0 && active_typing_seconds <= window_duration_seconds`, `micro_pauses_count >= 0` e `continuous_typing_minutes >= 0`.
     - Validar `cadence_cpm.is_finite() && cadence_cpm >= 0.0` e `peak_cpm.is_finite() && peak_cpm >= 0.0`.
   - `record_typing_snapshot(conn: &Connection, payload: CreateTypingSnapshotPayload) -> Result<TypingMetricSnapshot, String>` (gera `Uuid::new_v4()` e `Utc::now().to_rfc3339()`).
   - `record_typing_snapshots_batch`, `get_typing_snapshots_by_session`, `get_typing_history`, `delete_typing_snapshot`.
   - Módulo `#[cfg(test)] mod tests` testando inserção, validações de limites, rejeição de `NaN`/valores negativos, filtros temporais e `ON DELETE CASCADE` ao remover uma `MonitoringSession` usando `Connection::open_in_memory()`.
2. Registrar `pub mod typing_metric_snapshot_service;` em `src-tauri/src/services/mod.rs`.

---

### Passo 6: Serviço Background de Captura e Agregação (`src-tauri/src/services/typing_monitor_service.rs`)

Separar este serviço em **duas partes desacopladas** para máxima testabilidade (seguindo exatamente o desenho de `ReminderScheduler` + `start()` em `src-tauri/src/services/reminder_scheduler_service.rs`):

#### 6.1 Núcleo Puro e Determinístico (`TypingCadenceAggregator`)
Struct pura em Rust (100% testável sem banco ou janelas do SO) que recebe `tick(keystrokes_in_last_second: u32, now_utc: DateTime<Utc>)`:
- Mantém um *Ring Buffer* fixo `seconds_window: [u32; 60]` e um contador de segundos decorridos na janela atual (`elapsed_window_seconds: u8`).
- **`cpm` em tempo real**: soma dos últimos 60 slots de `seconds_window`.
- **`is_typing`**: `true` se houve teclas nos últimos `5` segundos (torna o indicador `"Digitando"` vs `"Pausa / Inativo"` muito mais responsivo do que esperar 60s inteiros esvaziarem, mantendo o CPM calculado sobre os 60s).
- **`peak_cpm`**: maior soma de 5 slots consecutivos dentro da janela multiplicada por `12.0`.
- **`active_typing_seconds`**: contagem de slots na janela com valor `> 0`.
- **`micro_pauses_count`**: contagem de sequências de $\ge 3$ slots zerados precedidos por slot `> 0` dentro da janela de 60s.
- **Uso Contínuo e Pausa Regenerativa Automática**:
  - Ao fechar um minuto com `keystrokes_count > 5`, incrementa `continuous_minutes += 1` e zera `consecutive_idle_seconds`.
  - Se `consecutive_idle_seconds >= 120` (2 minutos seguidos sem digitação relevante, alinhado à orientação do card *"Faça uma pausa de 2 minutos para alongar os pulsos"*), zera automaticamente `continuous_minutes = 0`.
  - Classifica `dominant_status`: `>= 25` -> `TypingStatus::Danger`, `15..=24` -> `TypingStatus::Warning`, `< 15` -> `TypingStatus::Good`.
- Ao completar `60` ticks ativos (`elapsed_window_seconds == 60`), retorna `Some(CreateTypingSnapshotPayload)` pronto para gravação no SQLite e reinicia os acumuladores da janela de 60s (preservando `total_keystrokes` da sessão e `continuous_minutes`).

#### 6.2 Estado Compartilhado e Threads (`TypingMonitorControl`)
- Contadores atômicos compartilhados com o listener do SO:
  - `capture_enabled: Arc<AtomicBool>`
  - `pending_keystrokes: Arc<AtomicU32>`
  - `stop_signal: Arc<AtomicBool>`
- `Mutex<TypingMonitorSessionState>` leve (acessado apenas 1x/segundo pelo worker e por comandos Tauri — **nunca** pela thread de teclado!) guardando `session_id: Option<String>`, `user_id: Option<i64>`, `is_paused: bool`, `aggregator: TypingCadenceAggregator` e `last_emitted: Option<LiveTypingMetrics>`.
- **Thread 1 (`typing-input-listener`)**:
  - No Windows: cria janela invisível `CreateWindowExW` com parent `HWND_MESSAGE`, registra `RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: 0x06, dwFlags: RIDEV_INPUTSINK, hwndTarget: hwnd }` e roda `GetMessageW`.
  - No handler de `WM_INPUT`: lê `RAWKEYBOARD`, atualiza bitmask `[u64; 4]` com base em `RI_KEY_BREAK` (KeyUp vs KeyDown) para barrar auto-repetição, ignora modificadores (`VK_SHIFT`, `VK_CONTROL`, `VK_MENU`, `VK_LWIN`, `VK_RWIN`, `VK_CAPITAL`) e, se `capture_enabled.load(Ordering::Relaxed)`, executa `pending_keystrokes.fetch_add(1, Ordering::Relaxed)`.
  - No encerramento (`stop_signal`): envia `PostThreadMessageW(WM_QUIT)` para encerrar o loop instantaneamente.
- **Thread 2 (`typing-monitor-worker`)**:
  - Loop a cada `1s`:
    1. Verifica em `AuthState` e `AppState` se há usuário autenticado (ou sessão visitante válida) e se `settings_service::is_module_enabled(&conn, uid, Module::TypingAnalysis)` está ativo. Se desativado ou sem sessão de monitoramento aberta/despausada, mantém `capture_enabled = false` e descarta `pending_keystrokes.swap(0, Ordering::Relaxed)`.
    2. Caso ativo, garante `capture_enabled = true`, coleta `let keys = pending_keystrokes.swap(0, Ordering::Relaxed);` e avança `aggregator.tick(keys, Utc::now())`.
    3. Se `aggregator.tick` produzir um `CreateTypingSnapshotPayload`, grava no banco via `typing_metric_snapshot_service::record_typing_snapshot(&conn, payload)`.
    4. Se o `LiveTypingMetrics` mudou desde o último segundo, emite `app.emit("typing-metrics-updated", &live_metrics)` para atualizar a UI sem polling.

#### 6.3 Ganchos de Sincronização nos Serviços Existentes
- Em `commands::monitoring_session::start_monitoring_session`: após iniciar a `MonitoringSession`, notificar `typing_monitor.attach_session(session.user_id, session.id.clone())`.
- Em `commands::monitoring_session::end_monitoring_session`: notificar `typing_monitor.detach_session(&payload.id)`.
- Em `commands::auth::logout`: notificar `typing_monitor.clear_all()`.
- Em `commands::settings::set_module_enabled` / `update_settings`: quando `typing_analysis` passar para `false`, chamar `typing_monitor.on_module_disabled()` para zerar janelas imediatamente e emitir estado inativo.

---

### Passo 7: Camada de Comandos (`src-tauri/src/commands/typing_metric_snapshot.rs`) e Registro em `lib.rs`

1. Criar `src-tauri/src/commands/typing_metric_snapshot.rs` com *thin controllers*:
   - **Persistência / Histórico**:
     - `record_typing_snapshot`
     - `record_typing_snapshots_batch`
     - `get_typing_snapshots_by_session`
     - `get_typing_history`
     - `delete_typing_snapshot`
   - **Controle em Tempo Real**:
     - `get_live_typing_metrics(monitor: State<'_, TypingMonitorControl>) -> Result<LiveTypingMetrics, String>`
     - `set_typing_monitoring_paused(monitor: State<'_, TypingMonitorControl>, paused: bool) -> Result<LiveTypingMetrics, String>`
     - `reset_typing_session_metrics(monitor: State<'_, TypingMonitorControl>) -> Result<LiveTypingMetrics, String>` (acionado pelo botão de resetar/pausa manual em `KeyboardMonitorCard.tsx`).
2. Registrar `pub mod typing_metric_snapshot;` em `src-tauri/src/commands/mod.rs`.
3. Em `src-tauri/src/lib.rs`:
   - No `.setup(|app| { ... })`: iniciar o serviço com `let typing_monitor = services::typing_monitor_service::start(app.handle().clone())?; app.manage(typing_monitor);`.
   - No `.invoke_handler(tauri::generate_handler![ ... ])`: expor os novos comandos de `commands::typing_metric_snapshot::*`.
   - No `.run(|app, event| { ... })`: dentro de `if matches!(event, tauri::RunEvent::Exit)`, chamar `app.state::<services::typing_monitor_service::TypingMonitorControl>().stop();`.

---

### Passo 8: Camada Frontend — Types, Services e Hook (`src/`)

1. **`src/types/typingMetricSnapshot.ts`**:
   - Definir `TypingStatus = "good" | "warning" | "danger"`, `TypingMetricSnapshotItem`, `CreateTypingSnapshotPayload`, `TypingSnapshotHistoryFilter` e `LiveTypingMetrics`.
2. **`src/services/typingMetricSnapshotService.ts` & `src/services/typingMonitorService.ts`**:
   - Implementar chamadas `invoke` protegidas por `isTauri()` (retornando valores neutros seguros quando aberto em preview de navegador fora do Tauri, mantendo compatibilidade com os testes existentes).
   - Assinar o evento `"typing-metrics-updated"` via `listen<LiveTypingMetrics>` de `@tauri-apps/api/event`.
3. **`src/hooks/useTypingMetrics.ts`**:
   - Ao montar (ou quando `enabled` / `isPaused` mudar):
     - Sincroniza estado de pausa com `typingMonitorService.setPaused(isPaused)`.
     - Consulta imediatamente `typingMonitorService.getLiveMetrics()` (garante que ao restaurar o app da bandeja do sistema ou voltar para a página `Monitoring.tsx`, os números já apareçam atualizados no primeiro frame, sem esperar o próximo tick).
     - Escuta `"typing-metrics-updated"` para atualizar o estado React em tempo real.
   - Expõe `{ metrics, resetMetrics }`.
4. *(Recomendação Arquitetural Opcional para Navegação Interna)*:
   - Caso deseje que a `MonitoringSession` continue aberta não apenas com o app minimizado/na bandeja, mas também quando o usuário clicar em **Relatórios** ou **Lembretes** no menu lateral, mover a chamada de abertura/fechamento de sessão de `Monitoring.tsx` para um contexto em `src/components/MainLayout.tsx`. Enquanto o usuário permanecer em `Monitoring.tsx` (incluindo minimizado ou oculto na bandeja via botão `X`), o ciclo atual já mantém o componente montado e a sessão ativa.

---

### Passo 9: Integração em `Monitoring.tsx` e `KeyboardMonitorCard.tsx` (Princípio 6)

1. **Refatorar `src/components/monitoring/KeyboardMonitorCard.tsx`**:
   - Remover `window.addEventListener("keydown")` e os dois `setInterval` locais, bem como o estado inicial simulado `useState(14)`.
   - Tornar o componente orientado por *props* recebidas de `Monitoring.tsx`:
     ```tsx
     export interface KeyboardMonitorCardProps {
       enabled?: boolean;
       isPaused?: boolean;
       metrics?: LiveTypingMetrics | null;
       onPauseRequested?: () => void;
       className?: string;
     }
     ```
   - Exibir:
     - **Velocidade**: `metrics?.cpm ?? 0` CPM
     - **Uso Contínuo**: `metrics?.continuousMinutes ?? 0` min (colorindo em âmbar aos 15 min e rosa aos 25 min com base em `metrics?.dominantStatus`)
     - **Teclas**: `metrics?.totalKeystrokes ?? 0`
     - **Badge de status no cabeçalho**:
       - Se `isPaused`: `"Em pausa"`
       - Senão, se `metrics?.isTyping`: `"Digitando"` (com indicador esmeralda pulsante)
       - Senão: `"Pausa / Inativo"`
   - Ao clicar no botão `RotateCcw` (`resetTypingSession`), invocar `onPauseRequested?.()`.

2. **Atualizar `src/pages/Monitoring.tsx` (`L336-L348`)**:
   - Ler `const typingEnabled = isModuleEnabled(moduleSettings, Module.TYPING_ANALYSIS);`.
   - Ajustar a abertura de sessão em `useMetricRecording` para iniciar quando `!modulesLoading && isMonitoring && !isCalibrationOpen && (posturalEnabled || typingEnabled)`, garantindo que a `MonitoringSession` seja compartilhada quando ambos estiverem ativos e continue funcional caso apenas digitação esteja habilitada.
   - Consumir `const { metrics: typingMetrics, resetMetrics: resetTypingMetrics } = useTypingMetrics({ enabled: typingEnabled, isPaused: !isMonitoring || isCalibrationOpen });`.
   - Renderizar `<KeyboardMonitorCard />` com os dados reais do backend:
     ```tsx
     <KeyboardMonitorCard
       enabled={typingEnabled}
       isPaused={!isMonitoring || isCalibrationOpen}
       metrics={typingMetrics}
       onPauseRequested={async () => {
         await resetTypingMetrics();
         setLogs((prev) => [
           {
             id: crypto.randomUUID(),
             timestamp: new Date().toLocaleTimeString(),
             type: "info",
             message: "Pausa de digitação registrada",
             detail: "Contador de uso contínuo do teclado foi reiniciado.",
           },
           ...prev,
         ].slice(0, 100));
       }}
     />
     ```

---

## 6. Estratégia de Testes, Verificação e Governança

### 6.1 Testes Automatizados no Backend Rust
Executar:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```
Casos de teste obrigatórios a incluir:
1. **`typing_metric_snapshot_service::tests`**:
   - Criação individual e em lote vinculada a uma `MonitoringSession` válida.
   - Rejeição de `session_id` inexistente, `keystrokes_count < 0`, `cadence_cpm` negativo/`NaN` e `active_typing_seconds > window_duration_seconds`.
   - Filtros de histórico por intervalo de tempo (`start_time`, `end_time`, `limit`).
   - Exclusão em cascata (`ON DELETE CASCADE`) quando a `MonitoringSession` pai é removida.
2. **`typing_monitor_service::tests`**:
   - Cálculo exato de `cpm`, `peak_cpm`, `active_typing_seconds` e `micro_pauses_count` ao longo de 60 ticks simulados.
   - Emissão de `CreateTypingSnapshotPayload` exatamente no 60º segundo e limpeza da janela para o minuto seguinte.
   - Incremento de `continuous_minutes` em minutos ativos (> 5 teclas) e **reset automático para `0`** após 120 segundos ociosos consecutivos.
   - Bloqueio total de contagem quando o módulo `Module::TypingAnalysis` está inativo em `settings` ou após `logout`.

### 6.2 Testes Automatizados e Build no Frontend
Executar:
```bash
npx vitest run
npm run build
```
- Atualizar `src/components/monitoring/KeyboardMonitorCard.test.tsx` para validar a renderização das métricas recebidas via `props` (`cpm`, `continuousMinutes`, `totalKeystrokes`, estados `good`/`warning`/`danger`, estado `isPaused` e estado `enabled={false}`).
- Atualizar `src/pages/Monitoring.test.tsx` para verificar a integração com `get_live_typing_metrics`, eventos `"typing-metrics-updated"` e acionamento de `reset_typing_session_metrics`.

### 6.3 Roteiro de Validação Manual End-to-End
1. **Digitação fora de foco**: Iniciar o monitoramento em `Monitoring`, focar o bloco de notas ou VS Code ao lado e digitar — confirmar que `CPM` e `Teclas` sobem em tempo real no Ergo sem atraso perceptível na digitação.
2. **Minimizado e Bandeja do Sistema**: Minimizar a janela e, em seguida, clicar no `X` para ocultá-la na bandeja do sistema; digitar em outro aplicativo por > 60 segundos; reabrir o Ergo pelo ícone da bandeja e verificar que:
   - O `KeyboardMonitorCard` exibe imediatamente o total acumulado e o tempo contínuo atualizados.
   - Uma linha foi gravada em `typing_metrics_snapshots` vinculada ao `session_id` ativo em `monitoring_sessions`.
3. **Auditoria de Privacidade no SQLite**: Inspecionar a tabela `typing_metrics_snapshots` no arquivo `ergo.db` e confirmar que existem apenas contadores numéricos agregados e timestamps de minuto, sem qualquer registro de caracteres ou teclas individuais.
4. **Respeito a `Configurações → Módulos` (`RN-14`)**: Desativar **Análise de Digitação** em Configurações, digitar em qualquer janela e confirmar que o card exibe `Módulo inativo` e nenhuma snapshot de teclado é inserida no banco.

### 6.4 Alinhamento com Regras de Negócio (`docs/base-conhecimento/regras-de-negocio.md`)
- Manter os textos de alerta em `KeyboardMonitorCard.tsx` estritamente como **orientações ergonômicas de pausa e postura de punhos/ombros**, sem caráter de diagnóstico clínico de LER/DORT (**RN-01** e **RN-02**).
- Atualizar a documentação de divergência **P-01 / RN-03** e **RN-14** na base de conhecimento caso o módulo de cadência de digitação passe a integrar oficialmente o escopo avaliado do projeto.

