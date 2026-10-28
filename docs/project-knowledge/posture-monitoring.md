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
         ▼ (Ângulos e EAR implementados; agregação/alertas pendentes)
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
| **Task 3.2** | Gerenciamento do Feed de Câmera e Concorrência de Dispositivo | `src/components/monitoring/WebcamFeed.tsx` | **Concluída** |
| **Task 3.3** | Geometria de Pescoço/Ombros e Orientação Vertical | `biomechanics.ts`, `poseAngles.ts`, testes e integração no feed | **Concluída** |
| **Task 3.4** | EAR, Piscadas e Distância Calibrada | `biomechanics.ts`, `ocularLandmarks.ts`, `blinkDetector.ts`, `blinkRate.ts`, `ocularMetrics.ts` | **Concluída** |
| **Task 4.1** | Calibração de Postura Neutra, IPD e Validação Óptica | `WorkspaceCalibrationModal.tsx`, `ocularLandmarks.ts`, `ocularConfig.ts`, `postureService.ts` | **Concluída** |
| **Task 4.2** | Filtro Temporal de Ruído (One Euro Filter / Suavização) | `temporalPostureFilter.ts`, `WebcamFeed.tsx` | **Concluída** |
| **Próximas** | Agregação Periódica de Snapshots, Score e Histerese de Alertas | Pipeline frontend e persistência em lote no SQLite | *Pendente* |

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
- **Isolamento Multi-usuário na Sessão Frontend**:
  - A página `Monitoring.tsx` e o modal `WorkspaceCalibrationModal.tsx` consomem o hook `useOptionalAuth()`.
  - Quando autenticado, o `userId: number` é explicitamente propagado nas consultas de calibração ativa (`postureService.getActiveCalibration(userId)`) e no payload de salvamento (`SaveCalibrationPayload.userId`), garantindo que diferentes perfis de usuário cadastrados na mesma máquina não misturem suas baselines antropométricas nem desativem registros de terceiros.

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
   - `FACE_LANDMARK_INDEX`: Índices legados da malha facial, preservados para compatibilidade. Seus arrays `ALL` não estão na ordem P1..P6 do EAR:
     - `LEFT_EYE`: `{ OUTER: 33, INNER: 133, TOP_1: 160, TOP_2: 158, BOTTOM_1: 144, BOTTOM_2: 153 }`
     - `RIGHT_EYE`: `{ OUTER: 362, INNER: 263, TOP_1: 385, TOP_2: 387, BOTTOM_1: 373, BOTTOM_2: 380 }`
   - `FACE_EAR_INDEX`: ordem canônica dos olhos anatômicos do sujeito: direito `[33,160,158,133,153,144]` e esquerdo `[362,385,387,263,373,380]`. Centros das íris: 468/473.

5. **Gerenciamento de Recursos**:
   - Método `close()` que fecha explicitamente as instâncias do WebAssembly e WebGL, liberando memória e threads quando a câmera é desativada.

### 5.3 Gerenciamento de Feed de Vídeo, FPS Throttling e Concorrência (Task 3.2)

Implementado e refatorado no componente `src/components/monitoring/WebcamFeed.tsx`:

1. **Gestão de Permissões e Stream (`navigator.mediaDevices.getUserMedia`)**:
   - Enumeração dinâmica de câmeras físicas (`enumerateDevices`) e listener para hotplug (`devicechange`).
   - Fechamento e liberação imediata de descritores de hardware do sistema operacional (`track.stop()` e `srcObject = null`) ao pausar o monitoramento ou desmontar o componente.

2. **Limitação do Ciclo de Inferência (10-12 FPS)**:
   - Throttling configurado em `INFERENCE_INTERVAL_MS = 90` (~11.1 FPS) no loop de `requestAnimationFrame`.
   - As inferências neurais pesadas do MediaPipe (`detectFrame`) são disparadas exclusivamente a cada ~90ms, reduzindo em mais de 65% o consumo de CPU/GPU em relação a loops não controlados de 30/60 FPS.
   - Suavização dos ângulos calculados via One Euro (`temporalPostureFilter.ts`), com corte adaptativo à velocidade e intervalo real entre inferências.

3. **Tratamento do Bloqueio Exclusivo do Windows (*Exclusive Lock*)**:
   - Interceptação de `NotReadableError`, `TrackStartError`, `AbortError` e `"device in use"` durante `getUserMedia`.
   - Monitoramento do evento `stream.getVideoTracks()[0].onended` em tempo real para detectar quando softwares externos (Google Meet, Microsoft Teams, Zoom) requisitam a câmera com bloqueio exclusivo do driver UVC/DirectShow.
   - Transição graciosa para o estado `isHardwareBusy`, liberando a câmera sem quebrar a aplicação e exibindo overlay informativo com botão de retomada rápida (*"Retomar Monitoramento"*).

4. **Detecção de Ausência do Usuário (ABSENT > 5s)**:
   - Verificação contínua da presença e confiança anatômica mínima dos pontos-chave (nariz e ombros). A extração de ângulos exige também ao menos uma orelha confiável; com corpo visível e pontos insuficientes, permanece em detecção parcial e pausa as métricas.
   - Se nenhuma landmark válida for detectada por mais de 5 segundos, o estado transita para `ABSENT` (`UserPresenceState`).
   - O cálculo de má postura é pausado para não registrar falsos alertas ou degradar o Ergo Score enquanto a estação de trabalho está vazia.
   - Notificação em tempo real via callbacks `onPresenceChange` e `onPostureUpdate`.

---

## 6. Fase 4: Calibração de Postura Neutra, IPD e Estimativa de Distância da Tela

Esta seção detalha o funcionamento, as equações matemáticas e os racionais de engenharia que fundamentam a calibração ergonômica e a medição de distância da tela em tempo real no aplicativo.

### 6.1 O Desafio da Ambiguidade de Escala em Câmeras 2D (Por que uma Baseline é Necessária)

Uma webcam convencional de notebook ou monitor externo é um sensor **2D monocular** (possui apenas uma lente RGB e não dispõe de sensores físicos de profundidade como LiDAR, câmeras estéreo com múltiplos sensores ópticos ou emissores infravermelhos Time-of-Flight).

Em uma projeção óptica bidimensional, a coordenada física de profundidade ($Z$) é perdida. Isso impõe dois desafios fundamentais da visão computacional:

1. **Variabilidade Antropométrica Individual**: A distância física entre as pupilas humanas (**IPD - Interpupillary Distance**) varia consideravelmente entre indivíduos adultos (faixa típica entre **54 mm e 74 mm**, com média global em torno de 63 mm). Uma pessoa com IPD estreito (55 mm) sentada a 50 cm projeta exatamente a mesma quantidade de pixels na imagem que uma pessoa com IPD largo (70 mm) sentada a 64 cm.
2. **Heterogeneidade de Lentes e Sensores**: Câmeras de mercado possuem campos de visão (FOV) distintos (ex.: lentes padrão de 60° versus grande-angulares de 90° a 110°) e resoluções variadas (720p, 1080p, 4K). Um mesmo rosto a 60 cm ocupará muito menos pixels em uma lente grande-angular do que em uma lente fechada.

Para contornar a ausência de hardware especializado e evitar a necessidade de calibrações de laboratório da matriz intrínseca da câmera ($f_x, f_y, c_x, c_y$), o Ergo adota o princípio da **Ancoragem Relativa via Baseline Neutra**.

---

### 6.2 Fluxo de Calibração da Postura Neutra (`WorkspaceCalibrationModal.tsx`)

O modal de calibração guia o usuário por orientações ergonômicas interativas e finaliza na coleta ativa de sua postura de referência:

1. **Posicionamento de Referência**: O usuário é instruído a sentar-se na postura ereta a aproximadamente **60 cm** da tela. Esta é uma referência assumida pelo posicionamento, não uma distância medida pela câmera.
2. **Contagem Regressiva Ativa (5 segundos)**: Durante `CALIBRATION_DURATION_SECONDS = 5`, `onCalibrationFrame` fornece ângulos e IPD da mesma inferência, sem arredondamento. A avaliação exige pelo menos 30 amostras, cobertura de 4 segundos, lacunas de até 500 ms e estabilidade dos ângulos brutos e da IPD. Dados ausentes não recebem substitutos. Mudanças de captura, resolução ou método durante a coleta a invalidam. Limites completos e roteiro de validação estão no [guia de calibração](../calibracao-postura.md).
3. **Métricas Coletadas e Nomenclatura Amigável na UI**:
   - **Ângulo do Pescoço**: Ângulo de flexão cervical em relação à vertical (graus).
   - **Balanceamento dos Ombros**: Nível de alinhamento horizontal dos ombros (0 a 100%).
   - **Distância de Referência**: Ancorado na constante de referência ergonômica (`DEFAULT_REFERENCE_DISTANCE_CM = 60 cm`).
   - **Distância de Olhos**: Distância em pixels entre as pupilas/olhos do usuário capturada pelo sensor naquela resolução de vídeo (`ipdPx`).
4. **Vínculo de Usuário e Persistência Relacional**:
   Ao término dos 5 segundos, as médias aritméticas das amostras são computadas e enviadas ao backend Rust através de `postureService.saveCalibration`, associando o identificador do usuário autenticado (`currentUserId` derivado de `useOptionalAuth` ou passado como prop):
   ```typescript
   const calibrationPayload: SaveCalibrationPayload = {
     userId: currentUserId,
     baselineNeckAngle: avgNeck,
     baselineShoulderBalance: avgShoulder,
     baselineDistanceCm: 60.0,
     baselineEyeDistancePx: avgIpd,
     isActive: true,
   };
   ```
   O serviço existente desativa baselines anteriores e insere o novo registro ativo. Essas operações ainda não compartilham uma transação SQLite; o backend também recebe `userId` do payload sem derivá-lo da sessão autenticada. O vínculo enviado pelo frontend não garante autorização no backend.

---

### 6.3 Distância Interpupilar (IPD - Interpupillary Distance) e Detecção Ocular

Implementado em `src/services/vision/ocularLandmarks.ts`:

1. **Pontos de Referência na Malha Facial (MediaPipe Face Mesh)**:
   - O detector utiliza a malha facial de **478 pontos anatômicos**.
   - **Centros das Íris (preferencial)**: Pontos `468` (íris anatômica direita) e `473` (íris anatômica esquerda). Fornecem a maior precisão biométrica para IPD.
   - **Cantos dos Olhos (fallback automático)**: Caso o modelo em execução não possua pontos de íris (ex.: malha legada de 468 pontos) ou ocorra oclusão pontual, o algoritmo calcula os pontos médios entre os cantos externos e internos de cada olho:
     - Olho anatômico direito: midpoint dos cantos `[33, 133]`.
     - Olho anatômico esquerdo: midpoint dos cantos `[362, 263]`.
2. **Tratamento Crítico do Runtime WebAssembly do MediaPipe**:
   - No compilado C++ WebAssembly de `@mediapipe/tasks-vision`, a rede neural `FaceLandmarker` não calcula scores de visibilidade individual por vértice (diferente da rede `PoseLandmarker`). Por padrão interno, os vértices faciais são exportados com `visibility: 0.0` e `presence: 1.0`.
   - Se o filtro de qualidade de pixels (`usablePixels`) avaliar cegamente `visibility <= 0.35`, todos os 478 pontos faciais seriam sumariamente descartados, travando os cálculos de EAR e IPD.
   - **Solução implementada em `poseDetector.ts` (`mapFaceLandmarks`)**: O serviço inspeciona o lote de landmarks; se todos os pontos apresentarem `visibility === 0`, o mapeador chaveia automaticamente para a métrica de confiança real da face (`presence: 1.0`), garantindo que o pipeline ocular receba coordenadas válidas.

---

### 6.4 Validação de Plausibilidade Óptica do IPD na Calibração

Implementado em `src/services/vision/ocularLandmarks.ts` (`validateCalibrationIPD`) e configurado em `src/services/vision/ocularConfig.ts` (`CALIBRATION_IPD_RATIO_LIMITS`):

1. **O Problema da Calibração em Distâncias Inadequadas**:
   Se o usuário sentar colado à tela (< 40 cm) ou encostado no fundo da sala (> 1 metro) no momento da calibração, o sistema gravaria um `baselineEyeDistancePx` distorcido. Como a distância em tempo real depende da razão inversa entre o IPD atual e a baseline, qualquer desvio nessa etapa inicial comprometeria todos os alertas futuros de aproximação e ergonomia.
2. **Equação da Razão Óptica Relativa**:
   Em vez de exigir largura fixa em pixels (o que quebraria entre 720p, 1080p e 4K), a validação avalia a **fração da largura da imagem** ocupada pela distância entre os olhos:
   $$\text{Ratio} = \frac{\text{ipdPx}}{\text{frameWidth}}$$
3. **Limites de Plausibilidade (`CALIBRATION_IPD_RATIO_LIMITS`)**:
   - `maxRatio: 0.20`: Razões acima de 20% da largura indicam proximidade excessiva da câmera (< 40–45 cm). Resultado: `"too-close"`.
   - `minRatio: 0.04`: Razões abaixo de 4% da largura indicam distância excessiva (> 90 cm). Resultado: `"too-far"`.
   - `"valid"` corresponde ao intervalo inclusivo de 0,04 a 0,20. `optimalMin`/`optimalMax` não são utilizados pelo validador. Esses limites são heurísticos e não comprovam uma distância física de 60 cm.
4. **Propagação Dinâmica de Resolução (`OcularMetrics.frameWidth`)**:
   `onCalibrationFrame` fornece as dimensões originais do vídeo junto com cada amostra. A coleta exige contexto uniforme e mantém a largura do resultado para revalidar a razão IPD/largura ao salvar. Não há garantia de precisão milimétrica.
5. **Fluxo de Proteção e Respeito à Autonomia do Usuário**:
   - **Bloqueio de Auto-Save**: Se a calibração for concluída mas o resultado for `"too-close"` ou `"too-far"`, o salvamento automático imediato é suspenso e o botão "Salvar" permanece desabilitado.
   - **Cards de Orientação Contextual**: Apresenta instruções claras de reposicionamento ("Afaste-se para a distância de mais ou menos 60cm" ou "Aproxime-se para a distância de mais ou menos 60cm").
   - **Ação "Recalibrar (5s)"**: Descarta o resultado e a confirmação anteriores e inicia outra amostragem. Cancelar também descarta os dados em memória e a intenção de salvar automaticamente.
   - **Ação "Desejo manter assim mesmo" (Override Manual)**: Caso o usuário tenha necessidades ergonômicas especiais ou utilize lentes grande-angulares atípicas, ele pode confirmar conscientemente que deseja manter a leitura, liberando o botão "Salvar".
   - **Confirmação Visual**: Informa que as leituras foram registradas e que 60 cm é a referência assumida; após override, informa a preferência manual do usuário.

---

### 6.5 Estimativa em Tempo Real da Distância da Tela

Implementado em `src/services/vision/biomechanics.ts` (`estimateScreenDistance`) e orquestrado por `src/services/vision/ocularMetrics.ts`:

1. **Reconstituição Dinâmica de Resolução (`ScreenDistanceReference`)**:
   - O banco de dados armazena `baselineDistanceCm` e `baselineEyeDistancePx`. A IPD em pixels depende da resolução, óptica e método usados na coleta.
   - Em tempo de execução, o `WebcamFeed.tsx` combina a calibração com a resolução ativa do stream da câmera (`video.videoWidth` e `video.videoHeight`) e com a fonte de IPD disponível (`iris` ou `eye-corners`).
   - O DTO ainda não preserva esse contexto. Sua compatibilidade ao reutilizar uma baseline persistida permanece pendente; a rejeição de mudanças durante a coleta não resolve essa limitação.
2. **Equação do Modelo de Câmera Pinhole**:
   A distância da tela é inversamente proporcional à distância dos olhos projetada no sensor:
   $$\text{Distância Atual (cm)} = \frac{\text{baselineDistanceCm} \times \text{baselineEyeDistancePx}}{\text{currentEyeDistancePx}}$$
3. **Estabilidade e Filtro Temporal**:
   - **Clamp de Limites Físicos**: `clampScreenDistance` restringe os valores para a faixa anatomicamente plausível de **20 cm a 150 cm**, eliminando artefatos pontuais.
   - **Filtro Suavizador EMA (Exponential Moving Average)**: Aplica amortecimento com $\alpha = 0.3$ para absorver micro-oscilações de iluminação e ruído do sensor óptico sem introduzir latência perceptível.
4. **Portão de Qualidade Postural (`isScreenDistancePoseUsable`)**:
   - Se o usuário girar ou inclinar a cabeça lateralmente ou verticalmente, a projeção 2D entre os olhos diminui geometricamente na imagem (encurtamento por perspectiva), o que falsearia o cálculo simulando que a pessoa se afastou.
   - O algoritmo extrai os ângulos de rotação cefálica em graus:
     - `pitch`: Inclinação vertical extraída da `facialTransformationMatrix` 4x4 do MediaPipe.
     - `yaw`: Rotação horizontal calculada a partir dos vetores de rotação da mesma matriz.
   - Se $|pitch| > 25^\circ$ ou $|yaw| > 25^\circ$ (`maxHeadRotationDegrees`), a estimativa de distância é **invalidada para aquele frame** (`distanceCm = null`), aguardando que o usuário retorne à orientação frontal.

---

### 6.6 Racional das Decisões de Projeto

| Decisão de Projeto | Justificativa Técnica / Ergonômica |
| :--- | :--- |
| **Fixação de 60 cm como distância de calibração** | Define a referência assumida pelo posicionamento do usuário. Um erro nessa distância inicial afeta proporcionalmente as estimativas posteriores; o aplicativo não mede nem confirma esses 60 cm. |
| **Validação de proporção IPD/frameWidth (4% a 20%)** | Sinaliza proporções extremas como heurística de plausibilidade. Não determina uma distância física sem conhecer a óptica da câmera. Permite confirmação manual para o resultado atual. |
| **Classificação por faixas ergonômicas em vez de precisão milimétrica** | O monitoramento postural não requer exatidão cirúrgica ($59.8\text{ cm}$ vs $60.2\text{ cm}$). O propósito essencial é distinguir a **Zona Saudável** (50 a 70 cm) da **Zona de Alerta** (< 45 cm, onde ocorre fadiga de acomodação do cristalino e projeção anterior da coluna). |
| **Janela de aquecimento de 30s para Taxa de Piscadas** | Extrapolar `piscadas/min` com apenas 5 ou 10 segundos de observação geraria taxas matemáticas erráticas (ex.: 1 piscada em 3s viraria 20/min). A janela mínima de 30s de rosto presente estabiliza a inferência antes de alertar sobre ressecamento ocular. |
| **Separação entre ausência do posto e má postura** | Se o usuário sai da mesa (pausa para café ou almoço), o sistema não deve penalizar o score nem registrar alertas de postura incorreta; ele simplesmente transita para `ABSENT` e congela as medições. |

---

## 7. Guia Prático para Agentes e Próximos Desenvolvimentos

### 7.1 Como Executar os Testes Unitários de Backend
Para verificar que as migrations e todos os fluxos de persistência do monitoramento postural continuam íntegros:
```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

### 7.2 Como Executar os Testes Automatizados de Frontend
Para validar os testes de biomecânica, geometria ocular, calibração e componentes:
```bash
npx vitest run
```

### 7.3 Status Atual e Próximos Passos do Pipeline
1. **Concluído**: Detecção de corpo e face via MediaPipe WASM offline, filtro temporal One Euro, captura e persistência de baseline de calibração no SQLite, cálculo de EAR e contagem de piscadas, estimativa monocular da distância da tela e integração em tempo real na página de Monitoramento.
2. **Próximas Tarefas (Fase de Agregação e Histórico)**:
   - Implementação do buffer temporal de agregação em memória para gravação periódica de snapshots consolidados (`posture_metrics_snapshots`) a cada 60 segundos no SQLite.
   - Motor de histerese para alertas persistentes de má postura sustentada (`posture_alerts`).
   - Cálculo e consolidação do Ergo Score diário da sessão de monitoramento.
