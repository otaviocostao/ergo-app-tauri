# Base de Conhecimento: Monitoramento Postural e Visão Computacional

Este documento consolida a arquitetura técnica, as decisões de projeto e o detalhamento de todos os módulos já implementados no ecossistema de **Monitoramento Postural e Ocular** do Ergo. Seu objetivo é servir como guia central e fonte de verdade para agentes de IA e desenvolvedores continuarem o desenvolvimento e manutenção da codebase.

---

## 1. Visão Geral da Arquitetura

O sistema opera através de um pipeline híbrido que combina visão computacional de baixa latência no frontend (WebAssembly + WebGL via WebView) com persistência relacional e orquestração de regras de negócio em Rust (Tauri Core) sobre SQLite:

```
[Webcam Video Stream]
         │
         ▼
[PoseDetectorService (MediaPipe)] ──> Extrai 33 Landmarks Corporais + 468/478 Faciais
         │
         ▼ (Próximas Tasks: Ângulos, EAR, Score)
[Pipeline de Métricas & Alertas]
         │
         ▼ (Tauri IPC Invoke)
[Tauri Commands Layer (Rust)]
         │
         ▼
[Services Layer (Rust)] ──> Regras de negócio, UUIDs v4, Timestamps ISO 8601 UTC
         │
         ▼
[Repositories Layer (Rusqlite)] ──> SQL parametrizado, batch inserts, filtros
         │
         ▼
[SQLite Local Database] ──> Tabelas relacionais com integridade referencial
```

---

## 2. Status das Fases e Tarefas

| Tarefa | Título | Módulos Principais | Status |
| :--- | :--- | :--- | :--- |
| **Task 1.1** | Instalação e Configuração de Dependências | `package.json`, `scripts/copy-wasm.mjs` | **Concluída** |
| **Task 1.2** | Armazenamento de Modelos Binários Offline | `public/models/`, `public/wasm/` | **Concluída** |
| **Task 2.1** | Schema do Banco de Dados SQLite | `src-tauri/migrations/0001_initial_migration.sql` | **Concluída** |
| **Task 2.2** | Camada de Modelos e DTOs no Rust | `src-tauri/src/models/` (`posture.rs`, etc.) | **Concluída** |
| **Task 2.3** | Camada de Repositório com Rusqlite | `src-tauri/src/repositories/` (`posture_repository.rs`, etc.) | **Concluída** |
| **Task 2.4** | Camada de Serviço e Validação no Rust | `src-tauri/src/services/` (`posture_service.rs`, etc.) | **Concluída** |
| **Task 2.5** | Camada de Comandos Tauri IPC | `src-tauri/src/commands/` (`posture.rs`), `src-tauri/src/lib.rs` | **Concluída** |
| **Task 2.6** | Tipagens e Serviços IPC no Frontend | `src/types/posture*.ts`, `src/services/postureService.ts` | **Concluída** |
| **Task 3.1** | Inicializador dos Detectores do MediaPipe | `src/services/vision/poseDetector.ts`, `src/types/vision.ts` | **Concluída** |
| **Task 3.2+**| Extração de Ângulos, Score e Pipeline | `src/services/vision/` | *Próxima etapa* |

---

## 3. Fase 1: Infraestrutura de Visão e Assets Offline

### 3.1 Dependência Principal
- Pacote: `@mediapipe/tasks-vision` (v1.1.0).
- Configuração registrada no arquivo `package.json`.

### 3.2 Script de Cópia e Runtime Wasm Local
Para garantir conformidade com a exigência de **execução 100% offline** (sem requisições externas para CDNs em tempo de execução):
- Foi implementado o script `scripts/copy-wasm.mjs`.
- É acionado automaticamente nas rotinas `npm run postinstall` e `npm run setup:wasm`.
- Copia os binários compilados do MediaPipe de `node_modules/@mediapipe/tasks-vision/wasm` para os diretórios públicos `public/wasm/` e `public/models/wasm/`:
  - `vision_wasm_internal.js` / `.wasm`
  - `vision_wasm_module_internal.js` / `.wasm`
  - `vision_wasm_nosimd_internal.js` / `.wasm`

### 3.3 Modelos Binários TFLite/Task
Armazenados localmente no diretório `public/models/`:
- `pose_landmarker_lite.task` (~5.78 MB): Modelo padrão otimizado para detecção esquelética rápida.
- `pose_landmarker_full.task` (~9.40 MB): Modelo de maior precisão disponível para uso seletivo.
- `face_landmarker.task` (~3.76 MB): Modelo de malha facial completa (468/478 pontos) para cálculo de piscadas (EAR) e orientação cefálica.

---

## 4. Fase 2: Persistência de Dados e Backend Rust (Tauri)

Seguindo rigorosamente o padrão de camadas definido no projeto (`Model` -> `Repository` -> `Service` -> `Command/Controller`), o backend gerencia todo o ciclo de vida dos dados posturais.

### 4.1 Schema SQLite (`src-tauri/migrations/0001_initial_migration.sql`)

A migration inicial define 4 tabelas centrais com integridade referencial:

1. **`posture_calibrations`**:
   - Guarda a referência antropométrica neutra salva pelo usuário ao calibrar a câmera.
   - Colunas: `id` (UUID PK), `user_id` (FK `users.id` com `ON DELETE SET NULL`), `baseline_neck_angle` (REAL), `baseline_shoulder_balance` (REAL), `baseline_distance_cm` (REAL), `baseline_eye_distance_px` (REAL), `is_active` (INTEGER 0 ou 1), `created_at`, `updated_at`.
   - Índices: `idx_posture_calibrations_active`, `idx_posture_calibrations_user_id`.

2. **`monitoring_sessions`**:
   - Representa um período contínuo de trabalho monitorado.
   - Colunas: `id` (UUID PK), `user_id` (FK `users.id` com `ON DELETE SET NULL`), `started_at` (TEXT ISO 8601), `ended_at` (TEXT), `duration_seconds` (INTEGER), `average_score` (REAL), `good_posture_percentage` (REAL), `warning_posture_percentage` (REAL), `danger_posture_percentage` (REAL), `total_alerts_count` (INTEGER), `created_at`, `updated_at`.
   - Índices: `idx_monitoring_sessions_user_id`, `idx_monitoring_sessions_started_at`.

3. **`posture_metrics_snapshots`**:
   - Amostras consolidadas em janelas temporais periódicas (ex.: a cada 60s) para compor gráficos de histórico e dashboards.
   - Colunas: `id` (UUID PK), `session_id` (FK `monitoring_sessions.id` com `ON DELETE CASCADE`), `timestamp` (TEXT ISO 8601), `avg_neck_angle` (REAL), `max_neck_angle` (REAL), `avg_shoulder_balance` (REAL), `min_shoulder_balance` (REAL), `avg_distance_cm` (REAL), `blink_count` (INTEGER), `dominant_status` (`good` | `warning` | `danger`), `score` (REAL), `samples_count` (INTEGER), `created_at`.
   - Índices: `idx_posture_metrics_snapshots_session_id`, `idx_posture_metrics_snapshots_timestamp`.

4. **`posture_alerts`**:
   - Log de anomalias posturais persistentes (ex.: cabeça projetada à frente por mais de 15s).
   - Colunas: `id` (UUID PK), `session_id` (FK `monitoring_sessions.id` com `ON DELETE CASCADE`), `timestamp` (TEXT ISO 8601), `alert_type` (TEXT), `severity` (`info` | `warning` | `danger`), `duration_seconds` (INTEGER), `message` (TEXT), `resolved_at` (TEXT ISO 8601), `created_at`.
   - Índices: `idx_posture_alerts_session_id`, `idx_posture_alerts_timestamp`, `idx_posture_alerts_resolved_at`.

---

### 4.2 Camada de Modelos e DTOs Rust (`src-tauri/src/models/`)

Cada entidade possui structs de domínio e DTOs anotados com `#[serde(rename_all = "camelCase")]`:

- **`src-tauri/src/models/monitoring_session.rs`**:
  - `MonitoringSession`: Entidade completa.
  - `CreateSessionPayload`: `{ userId?: number, startedAt?: string }`.
  - `EndSessionPayload`: `{ id, endedAt?, durationSeconds?, averageScore?, goodPosturePercentage?, warningPosturePercentage?, dangerPosturePercentage?, totalAlertsCount? }`.
- **`src-tauri/src/models/posture_metric_snapshot.rs`**:
  - `PostureMetricSnapshot`: Entidade completa.
  - `PostureStatus`: Enum serializado como string minúscula (`"good"`, `"warning"`, `"danger"`).
  - `CreateSnapshotPayload`: Dados consolidados para salvar um snapshot.
  - `SnapshotHistoryFilter`: `{ sessionId?, userId?, startDate?, endDate?, limit?, offset? }`.
- **`src-tauri/src/models/posture_alert.rs`**:
  - `PostureAlert`: Entidade de alerta.
  - `CreateAlertPayload`: Criação de novo alerta.
  - `ResolveAlertPayload`: `{ id, resolvedAt? }`.
  - `AlertFilter`: `{ sessionId?, alertType?, severity?, unresolvedOnly?, limit?, offset? }`.
- **`src-tauri/src/models/posture_calibration.rs`**:
  - `PostureCalibration`: Registro de calibração ativa/inativa.
  - `SaveCalibrationPayload`: Parâmetros neutros do usuário.
- **`src-tauri/src/models/posture.rs`**:
  - Fachada agregadora que re-exporta todos os tipos e payloads acima.

---

### 4.3 Camada de Repositórios Rust (`src-tauri/src/repositories/`)

Implementa manipulação SQL pura com `rusqlite` e consultas parametrizadas seguras:
- **`src-tauri/src/repositories/monitoring_session_repository.rs`**: Criação com defaults, update de encerramento, busca por ID, listagem por usuário, busca de sessão ativa (`ended_at IS NULL`) e deleção.
- **`src-tauri/src/repositories/posture_metric_snapshot_repository.rs`**: Inserção unitária, inserção em lote (`insert_batch`), consulta por sessão e consulta filtrada de histórico (`find_history`) com ordenação cronológica.
- **`src-tauri/src/repositories/posture_alert_repository.rs`**: Inserção de alerta, resolução por ID (`mark_as_resolved`), consulta com filtros dinâmicos de severidade/resolução e deleção.
- **`src-tauri/src/repositories/posture_calibration_repository.rs`**: `deactivate_all_for_user`, `insert`, busca de calibração ativa (`find_active_by_user_id`), listagem geral e deleção.
- **`src-tauri/src/repositories/posture_repository.rs`**: Fachada unificada exportando os submódulos como namespaces (`session`, `snapshot`, `alert`, `calibration`).

---

### 4.4 Camada de Serviços Rust (`src-tauri/src/services/`)

Responsável pelas regras de domínio:
- Gera identificadores únicos padrão com `Uuid::new_v4().to_string()`.
- Preenche timestamps omitidos com `Utc::now().to_rfc3339()`.
- Na calibração: desativa qualquer calibração ativa anterior antes de persistir uma nova como ativa.
- **Testes Unitários:** Em `src-tauri/src/services/posture_service.rs`, a suíte `test_posture_service_flow` testa in-memory com SQLite o ciclo completo:
  1. `save_posture_calibration`
  2. `start_monitoring_session`
  3. `record_metric_snapshot`
  4. `record_posture_alert`
  5. `get_posture_history`
  6. `end_monitoring_session`

---

### 4.5 Comandos Tauri IPC Registrados (`src-tauri/src/lib.rs`)

Todos os comandos recebem injeção do `State<'_, AppState>` gerenciado pelo Tauri:

| Domínio | Comando IPC Tauri | Descrição |
| :--- | :--- | :--- |
| **Calibração** | `save_posture_calibration` | Salva novos baselines do usuário e desativa anteriores |
| | `get_active_calibration` | Obtém calibração ativa do usuário autenticado |
| | `get_posture_calibrations` | Lista histórico de calibrações |
| | `delete_posture_calibration` | Remove registro de calibração |
| **Sessão** | `start_monitoring_session` | Inicia nova sessão de monitoramento postural |
| | `end_monitoring_session` | Finaliza sessão com totais, score médio e percentuais |
| | `get_active_monitoring_session`| Obtém sessão atualmente em andamento |
| | `get_monitoring_sessions` | Lista sessões de monitoramento do usuário |
| | `get_monitoring_session_by_id` | Obtém detalhes de uma sessão específica |
| | `delete_monitoring_session` | Exclui sessão e dados em cascata |
| **Snapshots** | `record_metric_snapshot` | Salva uma amostra periódica consolidada |
| | `record_metric_snapshots_batch`| Salva lote de amostras acumuladas |
| | `get_snapshots_by_session` | Obtém todas as amostras de uma sessão |
| | `get_posture_history` | Consulta histórico por filtros temporais |
| | `delete_metric_snapshot` | Remove um snapshot individual |
| **Alertas** | `record_posture_alert` | Registra nova ocorrência de desvio postural |
| | `resolve_posture_alert` | Marca um alerta como resolvido com timestamp |
| | `get_alerts_by_session` | Lista alertas pertencentes a uma sessão |
| | `get_posture_alerts` | Filtra alertas por tipo, severidade e status |
| | `delete_posture_alert` | Remove um alerta individual |

---

### 4.6 Camada de Integração Frontend (TypeScript)

- **Interfaces TypeScript**:
  - `src/types/monitoringSession.ts`
  - `src/types/postureCalibration.ts`
  - `src/types/postureMetricSnapshot.ts`
  - `src/types/postureAlert.ts`
  - `src/types/posture.ts` (barril com todos os tipos)
- **Serviços Frontend IPC**:
  - `src/services/postureService.ts`: Fachada unificada que consome os serviços granulares:
    - `monitoringSessionService`
    - `postureCalibrationService`
    - `postureMetricSnapshotService`
    - `postureAlertService`

---

## 5. Fase 3: Detecção de Visão com MediaPipe (Task 3.1)

O módulo de visão computacional em tempo real foi implementado em `src/services/vision/poseDetector.ts` e exposto via `src/services/vision/index.ts` e `src/types/vision.ts`.

### 5.1 Classe `PoseDetectorService`

Gerencia o ciclo de vida e a execução simultânea dos dois modelos do MediaPipe: `PoseLandmarker` e `FaceLandmarker`.

```typescript
import { poseDetector } from "@/services/vision";

// Inicialização com configurações padrão (offline, GPU/WebGL, VIDEO mode)
await poseDetector.initialize();

// Verificação de prontidão
if (poseDetector.isReady()) {
  const result = poseDetector.detectFrame(videoElement);
  console.log("Pose detectada?", result.hasPose);
  console.log("Face detectada?", result.hasFace);
}
```

### 5.2 Recursos e Decisões de Implementação

1. **Aceleração por Hardware com Fallback Transparente**:
   - Tenta inicializar com `delegate: "GPU"` (WebGL).
   - Se o contexto WebGL falhar ou a GPU não suportar extensões necessárias, captura o erro e faz **fallback automático para `delegate: "CPU"`**, garantindo que a aplicação não quebre em máquinas modestas.

2. **Garantia de Monotonicidade nos Timestamps**:
   - O MediaPipe Tasks no modo `VIDEO` exige que `timestampMs` seja estritamente crescente (`ts > lastTimestamp`).
   - O `detectFrame` trata isso automaticamente: se dois quadros consecutivos forem disparados no mesmo milissegundo pelo `requestAnimationFrame`, incrementa `lastTimestamp + 1` para prevenir exceções do runtime C++/Wasm.

3. **Mapeamento Unificado de Coordenadas (`LandmarkPoint`)**:
   - Converte os pontos nativos do MediaPipe para a estrutura limpa e tipada:
     ```typescript
     export interface LandmarkPoint {
       x: number;          // Normalizado [0.0, 1.0]
       y: number;          // Normalizado [0.0, 1.0]
       z: number;          // Profundidade relativa
       visibility?: number;// Confiança de visibilidade [0.0, 1.0]
       presence?: number;  // Confiança de presença [0.0, 1.0]
     }
     ```

4. **Constantes de Índices Anatômicos Exportadas**:
   - `POSE_LANDMARK_INDEX`: Índices essenciais dos 33 landmarks corporais (nariz: 0, orelhas: 7/8, ombros: 11/12, cotovelos: 13/14, pulsos: 15/16).
   - `FACE_LANDMARK_INDEX`: Índices da malha facial (468 pontos) com definições completas para os 6 pontos de cada olho para o cálculo futuro de **EAR (Eye Aspect Ratio)**:
     - `LEFT_EYE`: `{ OUTER: 33, INNER: 133, TOP_1: 160, TOP_2: 158, BOTTOM_1: 144, BOTTOM_2: 153 }`
     - `RIGHT_EYE`: `{ OUTER: 362, INNER: 263, TOP_1: 385, TOP_2: 387, BOTTOM_1: 373, BOTTOM_2: 380 }`

5. **Gerenciamento de Recursos**:
   - Método `close()` que fecha explicitamente as instâncias do WebAssembly e WebGL, liberando memória e threads quando a câmera é desativada.

---

## 6. Guia Prático para Agentes e Próximos Desenvolvimentos

### 6.1 Como Executar os Testes Unitários de Backend
Para verificar que as migrations e todos os fluxos de persistência do monitoramento postural continuam íntegros:
```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

### 6.2 Onde Conectar a Próxima Task (Task 3.2: Extração de Ângulos e EAR)
O resultado retornado por `poseDetector.detectFrame(videoElement)` fornece:
- `result.poseLandmarks` (para cálculo do ângulo de flexão do pescoço e inclinação dos ombros).
- `result.faceLandmarks` (para cálculo do EAR dos olhos esquerdo e direito e contagem de piscadas).
- `result.worldLandmarks` (coordenadas 3D métricas em metros para validação de distância).

Os novos cálculos biomecânicos deverão ser implementados como funções puras em novos arquivos dentro de `src/services/vision/` (ex.: `angleCalculator.ts`, `blinkDetector.ts`, etc.) e consumidos pelo pipeline orquestrador.
