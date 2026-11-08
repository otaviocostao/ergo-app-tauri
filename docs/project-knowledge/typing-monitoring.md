# Base de Conhecimento: Monitoramento de Cadência de Digitação

Este documento consolida todas as decisões arquiteturais, os algoritmos implementados, o modelo de privacidade e as regras de negócio da funcionalidade de **Monitoramento e Análise de Cadência de Digitação** do Ergo. Seu objetivo é servir como fonte única de verdade para desenvolvedores e agentes de IA na manutenção e evolução do módulo.

---

## 1. Visão Geral da Arquitetura e Fluxo de Dados

O monitoramento de digitação opera integralmente em **segundo plano no backend nativo Rust (Tauri)**, desacoplado do foco de janela da WebView. Os eventos físicos do teclado são filtrados instantaneamente na pilha (sem persistir teclas ou intervalos individuais), convertidos em contadores atômicos, agregados segundo a segundo em uma janela circular de 60 segundos, transmitidos em tempo real para a interface React e consolidados a cada minuto no SQLite:

```
[Sistema Operacional: Teclado Global]
   ├─ Windows: Win32 Raw Input (WM_INPUT + RIDEV_INPUTSINK em HWND_MESSAGE)
   └─ Linux / macOS: Fallback global via rdev::listen
         │
         ▼ (Thread dedicada: typing-input-listener)
[KeystrokeFilter (Stack-Only)]
   ├─ Suprime auto-repetição física do SO (bitmask [u64; 4] de 256 bits)
   ├─ Ignora teclas modificadoras (Shift, Ctrl, Alt, Win, CapsLock)
   └─ Descarta imediatamente o código da tecla (vkey nunca sai da pilha)
         │
         ▼ (Incremento lock-free: AtomicU32::fetch_add)
[Thread de Agregação 1 Hz: typing-monitor-worker]
   ├─ Verifica guardiões: Autenticado + Módulo Ativo + Sessão Aberta + Não Pausado
   ├─ Drena contador atômico (swap(0)) do último segundo
   └─ Atualiza TypingCadenceAggregator (Ring Buffer [u32; 60])
         │
         ├────► A cada 1s: Emite evento Tauri "typing-metrics-updated" (LiveTypingMetrics)
         │                 └─► Hook useTypingMetrics -> Monitoring.tsx -> KeyboardMonitorCard.tsx
         │
         └────► A cada 60s ativos: typing_metric_snapshot_service::record_typing_snapshot
                                   └─► SQLite: tabela typing_metrics_snapshots (FK monitoring_sessions)
```

---

## 2. Decisões de Arquitetura e Racional de Engenharia

### 2.1 Migração do Frontend (DOM) para o Backend Nativo (Rust)
- **Problema anterior**: a implementação inicial escutava `window.addEventListener("keydown")` dentro do componente React. Em um aplicativo desktop de ergonomia, o usuário trabalha quase todo o tempo em outros softwares (IDE, navegador, editor de texto, planilhas). Assim que a janela do Ergo perdia foco, era minimizada ou recolhida para a bandeja do sistema (*System Tray*), a captura cessava completamente — além de timers do Chromium sofrerem *throttling* em janelas ocultas.
- **Decisão**: mover 100% da captura, filtragem, temporização e persistência para o processo Rust do Tauri. A interface React passou a ser puramente reativa e apresentacional, hidratada sob demanda ao abrir a tela e atualizada via *push* de eventos IPC.

### 2.2 Escolha de Win32 Raw Input (`WM_INPUT`) em vez de `WH_KEYBOARD_LL` no Windows
- **Problema com hooks globais (`SetWindowsHookExW` / `WH_KEYBOARD_LL`)**: interceptam a fila síncrona de entrada de todo o sistema operacional. Qualquer atraso na thread do hook introduz *input lag* perceptível na digitação do usuário em outros programas, além de ser frequentemente sinalizado por heurísticas de antivírus/EDR como comportamento típico de *keylogger*.
- **Decisão no Windows (`windows-sys`)**: utilizar a API oficial **Win32 Raw Input** (`RegisterRawInputDevices` com `usUsagePage = 0x01`, `usUsage = 0x06` e flag `RIDEV_INPUTSINK`) associada a uma janela invisível exclusiva de mensagens (`HWND_MESSAGE`).
  - O Windows entrega cópias assíncronas dos pacotes de hardware via `WM_INPUT` sem bloquear a fila de eventos de outros aplicativos (zero *input lag*).
  - Funciona continuamente mesmo com a janela principal oculta na bandeja do sistema.
  - Não exige privilégios de administrador (exceto para capturar janelas que estejam rodando elevadas como Administrador caso o Ergo esteja em nível padrão — limitação padrão de segurança *UIPI* do Windows).
- **Fallback Multiplataforma (`rdev`)**: para compilações em Linux e macOS (`#[cfg(not(target_os = "windows"))]`), foi integrado `rdev::listen`, aplicando exatamente o mesmo filtro de modificadores e supressão de auto-repetição antes de incrementar o contador atômico.

### 2.3 *Privacy by Design* — Arquitetura Estritamente Não-Keylogger
Para proteger a privacidade do usuário e alinhar o software à LGPD e à diretriz de minimização de dados (**RN-07**):
1. **Descarte imediato de identidade da tecla**: o código virtual (`VKey`) existe apenas em variáveis locais na pilha da função de callback para verificar se é modificador ou repetição automática. Nenhuma `struct`, fila, log ou tabela armazena códigos de teclas, caracteres ou palavras.
2. **Prevenção contra biometria comportamental (*Keystroke Dynamics*)**: timestamps individuais por tecla (`inter-keystroke timing` em milissegundos) **não** são gravados, pois intervalos exatos entre teclas permitem inferir sequências digitadas e perfil biométrico. O único dado compartilhado entre a thread do SO e o agregador é um inteiro `AtomicU32` contendo a soma bruta de teclas válidas pressionadas naquele segundo.
3. **Persistência puramente estatística**: o banco SQLite recebe no máximo 1 linha por minuto ativo contendo exclusivamente métricas agregadas de cadência e pausas.

### 2.4 Desacoplamento de Threads e Caminho Crítico *Lock-Free*
O serviço [`typing_monitor_service.rs`](../../src-tauri/src/services/typing_monitor_service.rs) divide o trabalho em duas threads independentes:
1. **`typing-input-listener`**: executa o loop de mensagens nativo do SO (`GetMessageW` no Windows / `rdev::listen` em Unix). Não realiza queries SQLite, não aloca memória no heap por tecla e não disputa `Mutex` — apenas executa `pending_keystrokes.fetch_add(1, Ordering::Relaxed)` quando `capture_enabled` está ativo.
2. **`typing-monitor-worker`**: acorda a cada `1000 ms`, drena atomicamente o contador (`pending_keystrokes.swap(0, Ordering::Relaxed)`), atualiza o agregador em memória, emite o evento `"typing-metrics-updated"` para a UI e, a cada 60 ticks ativos, persiste o snapshot no SQLite.

### 2.5 Isolamento do `AppHandle` para Testes Unitários no Windows
No Windows, o `tauri_build::build()` vincula o manifesto Side-by-Side do Common Controls v6 (`comctl32.dll` / `TaskDialogIndirect`) apenas em binários finais (`bins`), e não no binário de testes `--lib`. Para evitar falhas de inicialização de DLL (`STATUS_ENTRYPOINT_NOT_FOUND` / `0xc0000139`) ao rodar `cargo test`:
- `TypingMonitorShared` armazena um callback abstrato `MetricsEmitter` (`Arc<dyn Fn(&LiveTypingMetrics) + Send + Sync>`) em vez de `AppHandle<tauri::Wry>` concreto.
- `typing_monitor_service::start<R: Runtime>(app: AppHandle<R>)` é genérico sobre `R: Runtime`.
- Os comandos IPC recebem `State<'_, TypingMonitorControl>`, permitindo testar 100% do ciclo de vida do monitor em memória sem instanciar o runtime gráfico do Tauri.

### 2.6 Conformidade Arquitetural do Backend
Seguindo o padrão do projeto (`.agents/skills/backend-model-development/SKILL.md`):
- Arquitetura estrita em 4 camadas: `models` -> `repositories` -> `services` -> `commands`.
- Código, identificadores, comentários e mensagens técnicas de validação em inglês; textos voltados ao usuário na UI em português.
- Serialização JSON padronizada com `#[serde(rename_all = "camelCase")]`.
- Política de **migration única**: a tabela `typing_metrics_snapshots` foi adicionada diretamente em [`src-tauri/migrations/0001_initial_migration.sql`](../../src-tauri/migrations/0001_initial_migration.sql).

---

## 3. Modelagem de Dados e Camadas do Backend

### 3.1 Schema SQLite (`typing_metrics_snapshots`)
Definida em [`src-tauri/migrations/0001_initial_migration.sql`](../../src-tauri/migrations/0001_initial_migration.sql), vinculada à sessão de monitoramento com exclusão automática em cascata (`ON DELETE CASCADE`):

| Coluna | Tipo SQLite | Restrições / Semântica |
| :--- | :--- | :--- |
| `id` | `TEXT PRIMARY KEY` | UUID v4 gerado no `typing_metric_snapshot_service`. |
| `session_id` | `TEXT NOT NULL` | FK para `monitoring_sessions(id) ON DELETE CASCADE`. |
| `timestamp` | `TEXT NOT NULL` | Instante de fechamento da janela em ISO 8601 / RFC 3339 UTC. |
| `window_duration_seconds` | `INTEGER NOT NULL DEFAULT 60` | Duração da janela consolidada (`CHECK > 0`). |
| `keystrokes_count` | `INTEGER NOT NULL DEFAULT 0` | Total de teclas válidas pressionadas no minuto (`CHECK >= 0`). |
| `cadence_cpm` | `REAL NOT NULL DEFAULT 0.0` | Velocidade média da janela em teclas por minuto (`CHECK >= 0.0`). |
| `peak_cpm` | `REAL NOT NULL DEFAULT 0.0` | Maior pico de velocidade em sub-janelas de 5s (`CHECK >= 0.0`). |
| `active_typing_seconds` | `INTEGER NOT NULL DEFAULT 0` | Quantos segundos dentro da janela tiveram ao menos 1 tecla (`0..=window_duration_seconds`). |
| `micro_pauses_count` | `INTEGER NOT NULL DEFAULT 0` | Quantidade de pausas curtas (`>= 3s` ociosos após atividade) na janela (`CHECK >= 0`). |
| `continuous_typing_minutes` | `INTEGER NOT NULL DEFAULT 0` | Minutos ativos contínuos acumulados até o fechamento da janela (`CHECK >= 0`). |
| `dominant_status` | `TEXT NOT NULL` | Classificação ergonômica no minuto: `'good'`, `'warning'` ou `'danger'`. |
| `created_at` | `TEXT NOT NULL` | Timestamp UTC de gravação do registro. |

Índices criados:
- `idx_typing_metrics_snapshots_session_id` em `(session_id)`
- `idx_typing_metrics_snapshots_timestamp` em `(timestamp)`

### 3.2 Validações de Domínio no Serviço (`typing_metric_snapshot_service.rs`)
Antes de qualquer inserção unitária (`record_typing_snapshot`) ou em lote transacional (`record_typing_snapshots_batch`), [`validate_typing_snapshot_payload`](../../src-tauri/src/services/typing_metric_snapshot_service.rs) garante:
1. `session_id` não pode ser vazio e **precisa existir** em `monitoring_sessions` (`monitoring_session_repository::find_by_id`).
2. `window_duration_seconds > 0`.
3. `keystrokes_count >= 0`, `micro_pauses_count >= 0` e `continuous_typing_minutes >= 0`.
4. `active_typing_seconds >= 0` e `active_typing_seconds <= window_duration_seconds`.
5. `cadence_cpm` e `peak_cpm` devem ser finitos (`is_finite()`, rejeitando `NaN` e `±Infinity`) e `>= 0.0`.

### 3.3 Comandos IPC e Eventos Tauri Expostos

| Tipo | Nome | Responsabilidade |
| :--- | :--- | :--- |
| **Command** | `record_typing_snapshot` | Persiste uma snapshot consolidada de 60s. |
| **Command** | `record_typing_snapshots_batch` | Persiste um lote de snapshots em transação única (`unchecked_transaction`). |
| **Command** | `get_typing_snapshots_by_session` | Lista todas as snapshots de uma sessão em ordem cronológica ascendente (`timestamp ASC`). |
| **Command** | `get_typing_history` | Consulta histórico filtrado por `sessionId`, `startTime`, `endTime` e `limit` (`timestamp DESC`). |
| **Command** | `delete_typing_snapshot` | Remove uma snapshot específica por ID. |
| **Command** | `get_live_typing_metrics` | Retorna o estado instantâneo (`LiveTypingMetrics`) para hidratação imediata da UI. |
| **Command** | `set_typing_monitoring_paused` | Pausa ou retoma o monitor de digitação sincronizado com os controles da tela. |
| **Event** | `"typing-metrics-updated"` | Emitido a cada 1s (e em mudanças de estado/sessão) com o payload `LiveTypingMetrics`. |

---

## 4. Lógica Algorítmica Implementada

### 4.1 Filtragem de Teclas e Supressão de Auto-Repetição (`KeystrokeFilter`)
Implementado em [`typing_monitor_service.rs`](../../src-tauri/src/services/typing_monitor_service.rs):

1. **Mapa de Bits de 256 Posições (`pressed_keys: [u64; 4]`)**:
   - Cada `vkey` (`u8` / `u16` entre `1` e `254`) é mapeado para `bucket = vkey / 64` e `mask = 1u64 << (vkey % 64)` diretamente na pilha, sem alocação dinâmica (`HashSet` não é usado).
   - **No evento de descida da tecla (*Key Down*)**: se o bit correspondente já estiver `1`, trata-se de **auto-repetição gerada pelo sistema operacional** enquanto o usuário mantém a tecla física segurada — o evento é **ignorado**. Caso o bit esteja `0`, ele é marcado como `1` e segue para o filtro de modificadores.
   - **No evento de subida da tecla (*Key Up* — `RI_KEY_BREAK` / `WM_KEYUP` / `WM_SYSKEYUP`)**: limpa o bit (`&= !mask`) e retorna `false` (soltar tecla nunca conta como novo pressionamento).
   - Quando a captura é desabilitada ou pausada, o mapa `pressed_keys` é zerado para evitar estados presos (*stuck bits*).

2. **Exclusão de Teclas Modificadoras e Códigos Inválidos**:
   - Códigos `0x00` (não atribuído) e `>= 0xFF` (prefixos de escape de *scan code* multi-byte do hardware) são descartados.
   - Teclas puramente modificadoras ou de bloqueio de estado não representam cadência de digitação textual e são ignoradas:
     - `VK_SHIFT` (`0x10`), `VK_LSHIFT` (`0xA0`), `VK_RSHIFT` (`0xA1`)
     - `VK_CONTROL` (`0x11`), `VK_LCONTROL` (`0xA2`), `VK_RCONTROL` (`0xA3`)
     - `VK_MENU` / `Alt` (`0x12`), `VK_LMENU` (`0xA4`), `VK_RMENU` (`0xA5`)
     - `VK_LWIN` (`0x5B`), `VK_RWIN` (`0x5C`)
     - `VK_CAPITAL` / `CapsLock` (`0x14`)
   - No fallback Linux/macOS (`rdev`), as teclas equivalentes (`ShiftLeft/Right`, `ControlLeft/Right`, `Alt`, `AltGr`, `MetaLeft/Right`, `CapsLock`) são mapeadas para os mesmos códigos e filtradas pela mesma função.

### 4.2 Janela Circular de 60 Segundos e Fórmulas de Métricas (`TypingCadenceAggregator`)
O agregador mantém um *ring buffer* fixo `seconds_window: [u32; 60]` onde cada posição representa a quantidade de teclas válidas pressionadas em 1 segundo:

- **Ordenação Cronológica (`ordered_window`)**: reconstrói os últimos 60 segundos do mais antigo (`t - 59s`) ao mais recente (`t`).
- **Velocidade Instantânea (`LiveTypingMetrics.cpm`)**: soma das teclas nos últimos 60 segundos do *ring buffer* (`sum(ordered)`). Quando o monitoramento está inativo/pausado, reporta `0`.
- **Cadência Média da Snapshot (`cadence_cpm`)**: ao fechar 60 ticks ativos:
  $$\text{cadence\_cpm} = \left(\frac{\text{keystrokes\_count}}{\text{window\_duration\_seconds}}\right) \times 60$$
- **Pico de Rajada de 5 Segundos (`peak_cpm`)**: avalia todas as 56 sub-janelas contíguas de 5 segundos (`window.windows(5)`) dentro do minuto e extrapola a maior soma para a base por minuto:
  $$\text{peak\_cpm} = \max_{i} \left(\sum_{k=i}^{i+4} \text{window}[k]\right) \times \frac{60}{5}$$
  *(Multiplicador igual a `12.0`: por exemplo, 25 teclas em 5 segundos equivalem a um pico de rajada de `300 CPM`.)*
- **Segundos Ativos (`active_typing_seconds`)**: contagem de slots na janela de 60s com `keystrokes > 0` (`0` a `60`).
- **Micro-Pausas (`micro_pauses_count`)**: conta quantas sequências de segundos ociosos (`0` teclas) atingem **`MICRO_PAUSE_MIN_IDLE_SECONDS = 3` segundos consecutivos**, contabilizadas **somente após ter havido ao menos 1 segundo com digitação** na janela (silêncio inicial antes de começar a digitar não é considerado micro-pausa; uma pausa longa de 10s conta como 1 episódio de micro-pausa naquela sequência).
- **Indicador de Digitação em Tempo Real (`is_typing`)**: verdadeiro quando o monitoramento está ativo e **qualquer um dos últimos 5 segundos** (`ACTIVE_TYPING_RECENCY_SECONDS = 5`) teve `keystrokes > 0`. Isso mantém o badge `"Digitando"` estável entre palavras sem piscar a cada fração de segundo, caindo para `"Pausa / Inativo"` após 5s sem teclas.

---

## 5. Regras de Negócio da Feature

### 5.1 Escopo da Avaliação de Risco Ergonômico (`dominant_status`)
A avaliação de risco implementada baseia-se na **duração contínua de esforço repetitivo sem pausa regenerativa** (`continuous_minutes`), e **não** penaliza o usuário por digitar rápido (um usuário com alta velocidade de digitação não entra em alerta mais cedo do que um usuário lento, desde que respeite pausas regulares):

| Faixa de `continuous_minutes` | Status (`TypingStatus`) | Comportamento Visual no `KeyboardMonitorCard` | Mensagem de Orientação Ergonômica |
| :--- | :--- | :--- | :--- |
| **`0` a `14 min`** | `good` | Contador neutro + Banner Esmeralda (`CheckCircle2`) | *"Ritmo saudável de digitação com pausas regulares."* |
| **`15` a `24 min`** | `warning` | Contador âmbar + Banner Âmbar (`Clock`) | *"Sessão Moderada de Digitação — Lembre-se de relaxar os ombros e apoiar bem os antebraços na mesa."* |
| **`>= 25 min`** | `danger` | Contador rosa + Banner Rosa (`AlertCircle`) | *"Recomendado Fazer uma Pausa! — Você está digitando há mais de 25 minutos seguidos. Faça uma pausa de 2 minutos para alongar os pulsos."* |

> **Alinhamento com Regras de Negócio do TCC (`RN-01` e `RN-02`)**: todas as mensagens da interface foram redigidas estritamente como **orientações ergonômicas preventivas** de pausa e postura de punhos/antebraços/ombros, sem emitir diagnóstico clínico de LER/DORT ou promessa médica de prevenção.

### 5.2 Critério de Minuto Ativo (`ACTIVE_MINUTE_MIN_KEYSTROKES = 5`)
Ao fechar cada ciclo de 60 segundos ativos:
- Se `keystrokes_count > 5` (**6 ou mais teclas válidas no minuto**): o minuto é classificado como **minuto ativo de digitação**, incrementando `continuous_minutes += 1` e zerando `consecutive_inactive_minutes = 0`.
- Se `keystrokes_count <= 5` (**0 a 5 teclas no minuto**): o minuto é classificado como **minuto esparso/inativo**. Toques eventuais (como pressionar `Espaço` para pausar um vídeo, `PageDown` durante leitura ou confirmar um diálogo com `Enter`) **não** incrementam `continuous_minutes`.

### 5.3 Regras de Pausa Regenerativa e Reset da Análise de Risco
Para que o usuário saiba quanto tempo pode ficar sem digitar e quando o risco acumulado é zerado, coexistem **dois mecanismos automáticos de pausa regenerativa** durante a sessão (além do reset total das métricas apenas ao encerrar a sessão de monitoramento):

1. **Reset por Ociosidade Absoluta de 2 Minutos (`REGENERATIVE_PAUSE_IDLE_SECONDS = 120`)**:
   - A cada segundo com `0` teclas, `consecutive_idle_seconds` aumenta em `1` (qualquer tecla válida reseta `consecutive_idle_seconds = 0`).
   - Enquanto o usuário ficar sem digitar por **até `119` segundos (`1 min 59s`)** — por exemplo, lendo um documento ou pensando no código — o valor de `continuous_minutes` **permanece preservado** sem resetar.
   - Ao atingir **`120` segundos consecutivos (`2 minutos`) sem nenhuma tecla**, o sistema considera cumprida a pausa regenerativa recomendada e **zera imediatamente `continuous_minutes = 0`** (retornando o status em tempo real para `good`, mesmo antes do fechamento do próximo snapshot).

2. **Reset por 2 Minutos Fechados de Baixíssima Atividade (`REGENERATIVE_PAUSE_INACTIVE_MINUTES = 2`)**:
   - Caso o usuário esteja descansando da digitação, mas toque acidentalmente em 1 ou 2 teclas (ex.: mover seta ou `Espaço`), a contagem de 120s de zero absoluto seria interrompida.
   - Para não punir esse cenário, se **2 janelas consecutivas de 60 segundos** fecharem com **`<= 5` teclas cada**, `consecutive_inactive_minutes` atinge `2` e `continuous_minutes` também é **zerado para `0`**.

### 5.4 Compartilhamento e Ciclo de Vida da Sessão (`MonitoringSession`)
1. **Sessão Unificada entre Postura e Digitação**:
   - Tanto `posture_metrics_snapshots` quanto `typing_metrics_snapshots` apontam para a mesma chave estrangeira `monitoring_sessions(id)`.
   - Na página `Monitoring.tsx`, o hook `useMetricRecording` abre uma `MonitoringSession` sempre que:
     ```ts
     !modulesLoading && isMonitoring && !isCalibrationOpen && (posturalEnabled || typingEnabled)
     ```
2. **Operação Isolada sem Câmera (`posturalEnabled = false`, `typingEnabled = true`)**:
   - O 4º parâmetro `recordPosture` de `useMetricRecording` controla se o agregador JS de postura/alertas deve rodar.
   - Se `posturalAnalysis` e `ocularAnalysis` estiverem desativados, mas `typingAnalysis` estiver ativo: **a webcam permanece desligada**, nenhum snapshot ou alerta postural é gerado, porém a `MonitoringSession` é aberta e encerrada normalmente para que o backend Rust associe todas as snapshots de teclado daquele período à sessão ativa do usuário.
   - Se **ambos** (`posturalAnalysis` e `typingAnalysis`) estiverem desativados, nenhuma sessão é aberta no banco para evitar sessões vazias.
3. **Troca ou Encerramento de Sessão**:
   - Os comandos de início e encerramento associam ou desassociam a sessão em `TypingMonitorControl`. Excluir uma sessão também remove seus snapshots pela chave estrangeira com `ON DELETE CASCADE`.
   - Ao encerrar a sessão, desligar o módulo de digitação ou sair da conta, o backend interrompe a captura, incorpora as teclas pendentes e salva a janela incompleta com sua duração efetiva antes de limpar o agregador. Janelas parciais sem teclas não geram um registro.
   - Uma falha de gravação é devolvida ao comando e mantém os agregados disponíveis para uma nova tentativa. O worker também salva a janela antes de limpar o estado quando detecta mudança de autenticação ou desativação do módulo.
   - O logout salva as métricas antes de remover a autenticação, mantendo o lock do banco durante essa sequência. Repetir o encerramento após uma gravação bem-sucedida não duplica o snapshot.
4. **Duração da Sessão Compartilhada**:
   - O tempo exibido e `monitoring_sessions.duration_seconds` usam o mesmo relógio monotônico, baseado no início salvo da sessão. Ligar ou desligar a postura preserva esse relógio e o identificador da sessão quando a digitação continua ativa.
   - A duração é congelada no momento de encerrar; esperas de gravação e novas tentativas não acrescentam tempo à sessão. Scores e percentuais de postura continuam calculados somente sobre amostras posturais válidas.

### 5.5 Condições de Ativação, Pausa, Câmera, Módulos (`RN-14`) e Autenticação
O monitor de teclado só contabiliza teclas e avança ticks quando **todas as 4 condições abaixo** são verdadeiras simultaneamente:
1. **Usuário autenticado (`Session::User(user_id)`)**: visitantes (`Guest`) ou estado deslogado (`Anonymous` / após `logout`) mantêm o monitor bloqueado e zerado.
2. **Módulo `Module::TypingAnalysis` ativo em `settings` (`RN-14`)**: alterações em `update_settings`, `set_module_enabled` ou `delete_settings` sincronizam `TypingMonitorControl` na mesma hora. A desativação salva a janela já coletada; com o módulo inativo, nenhuma tecla nova é contada, nenhuma janela nova avança e o card exibe `"Módulo inativo"`.
3. **Sessão de monitoramento aberta (`ended_at IS NULL`)** para o `user_id` autenticado.
4. **Não pausado manualmente (`paused == false`)**.

Regras adicionais de interação com a tela:
- **Independência de Ausência/Oclusão na Câmera**: quando o `WebcamFeed` detecta `ABSENT` (usuário fora do enquadramento > 5s), `PARTIALLY_OCCLUDED` ou câmera ocupada por Meet/Teams (`isHardwareBusy`), apenas as métricas visuais são pausadas. O monitoramento de digitação **continua ativo**, pois o usuário pode estar usando um monitor lateral, com a tampa da webcam fechada ou temporariamente fora do ângulo óptico enquanto digita.
- **Pausa Manual e Calibração**: pausar o monitoramento pelo botão principal (`!isMonitoring`) ou abrir o modal de calibração (`isCalibrationOpen`) envia `set_typing_monitoring_paused({ paused: true })` ao backend, congelando o estado e exibindo o badge `"Em pausa"`.
- **Teclas Pendentes e Inatividade**: a captura é interrompida antes de drenar o contador atômico. As teclas já coletadas são incorporadas à janela anterior antes de pausá-la ou salvá-la; teclas digitadas enquanto `capture_enabled = false` não são contabilizadas ao retomar.
- **Continuidade na Bandeja do Sistema (*System Tray*)**: ao fechar a janela principal no `X`, o aplicativo apenas oculta a WebView (`window.hide()` em `system_tray.rs`). Como as threads `typing-input-listener` e `typing-monitor-worker` pertencem ao processo Rust e a `MonitoringSession` continua aberta no SQLite, a contagem e a gravação de snapshots de 60s seguem ininterruptas até o usuário encerrar pelo menu *"Sair"* da bandeja (`RunEvent::Exit` executa `typing_monitor.stop()`).

---

## 6. Camada Frontend (TypeScript / React)

| Arquivo | Papel na Arquitetura |
| :--- | :--- |
| [`src/types/typingMetricSnapshot.ts`](../../src/types/typingMetricSnapshot.ts) | Espelha em `camelCase` os contratos Rust (`TypingStatus`, `TypingMetricSnapshotDTO`, `CreateTypingSnapshotPayload`, `TypingSnapshotHistoryFilter`, `LiveTypingMetrics`). |
| [`src/services/typingMetricSnapshotService.ts`](../../src/services/typingMetricSnapshotService.ts) | Serviço IPC para consulta de histórico e persistência/remoção de snapshots (`getBySession`, `getHistory`, `recordSnapshot`, `recordSnapshotsBatch`, `deleteSnapshot`), retornando vazio fora do runtime Tauri. |
| [`src/services/typingMonitorService.ts`](../../src/services/typingMonitorService.ts) | Wrapper resiliente para `get_live_typing_metrics`, `set_typing_monitoring_paused` e assinatura segura do evento `"typing-metrics-updated"` (normalizando payloads parciais em testes ou preview web). |
| [`src/hooks/useTypingMetrics.ts`](../../src/hooks/useTypingMetrics.ts) | Sincroniza `isPaused` com o backend, carrega o estado inicial ao montar/reativar e assina o stream de eventos `"typing-metrics-updated"` com *cleanup* seguro contra *race conditions*. |
| [`src/hooks/useMetricRecording.ts`](../../src/hooks/useMetricRecording.ts) | Gerencia abertura/encerramento serializado da `MonitoringSession` compartilhada e grava métricas posturais apenas quando `recordPosture === true`. |
| [`src/pages/Monitoring.tsx`](../../src/pages/Monitoring.tsx) | Orquestra `typingEnabled`, compartilha a `MonitoringSession` e conecta `useTypingMetrics` (desacoplado da presença óptica). |
| [`src/components/monitoring/KeyboardMonitorCard.tsx`](../../src/components/monitoring/KeyboardMonitorCard.tsx) | Componente puramente orientado a `props` que renderiza `CPM`, `Uso Contínuo`, `Teclas`, indicador pulsante de atividade, banners ergonômicos (`good`/`warning`/`danger`) e estado de módulo inativo. |

---

## 7. Verificação Automatizada e Manutenção

### 7.1 Comandos de Teste e Build
```bash
# Testes unitários e de integração em memória do Backend Rust (Model, Repository, Service, Aggregator, Filter e Control)
cargo test --manifest-path src-tauri/Cargo.toml

# Suíte de testes automatizados do Frontend (Vitest + JSDOM)
npx vitest run

# Verificação estática TypeScript + Build de produção Vite
npm run build
```

### 7.2 Cobertura Específica do Módulo
- **Backend (`src-tauri`)**:
  - `db::tests::fresh_database_enforces_typing_metrics_snapshots_schema_and_cascade`: valida constraints `CHECK` e deleção `ON DELETE CASCADE` ao apagar `monitoring_sessions`.
  - `models::typing_metric_snapshot::tests`: valida serialização `camelCase` e roundtrip SQLite do `TypingStatus`.
  - `repositories::typing_metric_snapshot_repository::tests`: valida `insert`, `insert_batch`, `find_all_by_session_id`, `find_history` e deleções.
  - `services::typing_metric_snapshot_service::tests`: valida regras de negócio, rejeição de `NaN`/negativos/`session_id` inexistente e filtros temporais.
  - `services::typing_monitor_service::tests`: valida supressão de auto-repetição e modificadores no `KeystrokeFilter`, cálculo exato de `cpm`/`peak_cpm`/`active_typing_seconds`/`micro_pauses_count` em 60 ticks, progressão `good -> warning -> danger`, reset após 120s ociosos e bloqueio quando `Module::TypingAnalysis` está desativado ou após `logout`.
- **Frontend (`src`)**:
  - `src/hooks/useTypingMetrics.test.tsx`: sincronização de pausa, carga inicial, recepção de `"typing-metrics-updated"` e fallback fora do Tauri.
  - `src/components/monitoring/KeyboardMonitorCard.test.tsx`: renderização de métricas via `props`, badges `"Digitando"` / `"Pausa / Inativo"` / `"Em pausa"`, alertas `good` / `warning` / `danger` e estado `enabled={false}`.
  - `src/pages/Monitoring.test.tsx`: integração ponta a ponta com `MonitoringSession` compartilhada, câmera desligada com sessão mantida para digitação e independência da oclusão da câmera.

### 7.3 Observação sobre Banco Local Pré-Existente
Como o projeto adota **migration única** (`0001_initial_migration.sql`), ambientes locais de desenvolvimento que já possuíam um arquivo `ergo.db` antigo em `AppData` (criado antes da introdução de `typing_metrics_snapshots`) devem remover o `ergo.db` local uma única vez antes de executar `npm run tauri dev`, permitindo a recriação limpa do schema completo.

