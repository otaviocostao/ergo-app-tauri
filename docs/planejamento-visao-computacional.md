# Planejamento Técnico: Módulo de Visão Computacional, Análise Postural e Persistência

Este documento estabelece o plano arquitetural, metodológico e de implementação para o sistema de visão computacional do **Ergo**, integrando detecção de pontos anatômicos, regras biomecânicas de classificação, mitigação de ruído temporal, modelo de persistência agregada no SQLite e fatores críticos complementares de análise ergonômica.

---

## 1. Visão Geral e Arquitetura do Pipeline

### 1.1 Decisão da Stack de Visão Computacional

No ecossistema Tauri (Rust no backend + WebView/React no frontend), existem duas abordagens possíveis para processamento de vídeo:

| Critério | Opção A: Processamento no Frontend (MediaPipe Tasks Vision / WebAssembly + WebGL) | Opção B: Processamento no Backend Rust (OpenCV + ONNX Runtime / Tract) |
| :--- | :--- | :--- |
| **Gargalo de IPC** | **Zero**. O stream de vídeo (`getUserMedia`) é processado diretamente na GPU/Canvas do WebView via WebAssembly e WebGL. | **Alto**. Exige transferir 15 a 30 frames/segundo em formato bruto (RGB/Base64) da WebView para o processo Rust, gerando alto consumo de CPU e latência de serialização IPC. |
| **Portabilidade & Build** | **Excelente**. Pacote `@mediapipe/tasks-vision` executado em WebAssembly, funcionando identicamente no Windows, Linux e macOS sem dependências de sistema C++. | **Complexa**. Compilação nativa de OpenCV/C++ em Rust para múltiplos sistemas operacionais (Windows MSVC, Linux, macOS) é propensa a falhas de linkagem e aumenta o tamanho do instalador em centenas de megabytes. |
| **Privacidade (LGPD / RN-07)** | **Garantida por design**. As imagens do usuário nunca saem do componente local do navegador; apenas números escalares calculados (ex: `neckAngle: 14.2`) são enviados via IPC para o Rust. | **Garantida**, mas requer descarte explícito de buffers de imagem na memória do processo Rust. |
| **Desempenho** | Aceleração por hardware nativa através da GPU (WebGL / WebGPU). | Alta performance em C++, mas penalizada pela ponte IPC de vídeo. |

> **Decisão Arquitetural Recomendada:**  
> Implementar a inferência de visão computacional no **Frontend através da biblioteca oficial `@mediapipe/tasks-vision`**, utilizando aceleração WebGL. O backend Rust (via comandos Tauri) receberá exclusivamente **métricas consolidadas, dados de calibração e eventos de alerta agregados**, respeitando o Princípio da Separação de Responsabilidades e a diretriz de privacidade **RN-07 / RQ-01**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (React 19 / WebView)                                                          │
│                                                                                        │
│   Webcam Stream (HTMLVideoElement)                                                     │
│         │                                                                              │
│         ▼                                                                              │
│   MediaPipe Vision Tasks (10-15 FPS em WebWorker / RAF)                                │
│   ├── PoseLandmarker (Ombros, Orelhas, Nariz)                                          │
│   └── FaceLandmarker (Olhos/EAR, Projeção Cefálica)                                    │
│         │                                                                              │
│         ▼                                                                              │
│   Feature Extractor & Biomechanical Calculator                                         │
│         │ (Filtro Passa-Baixa / One Euro Filter para suavizar ruído)                   │
│         ▼                                                                              │
│   Ergonomic Classifier (Compara com Calibração Base + Histerese Temporal)              │
│         │                                                                              │
│         ├──> UI Overlay & Dashboard (Canvas / React State em tempo real a cada frame)  │
│         └──> Aggregation Buffer (Acumula estatísticas em janelas de 60s)               │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Tauri IPC Invoke (Apenas a cada 60s ou em alertas)
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BACKEND RUST (Tauri Commands & Services)                                               │
│                                                                                        │
│   Commands (`src-tauri/src/commands/posture.rs`)                                       │
│         ▼                                                                              │
│   Posture Service (`src-tauri/src/services/posture_service.rs`)                        │
│         ▼                                                                              │
│   Posture Repository (`src-tauri/src/repositories/posture_repository.rs`)               │
│         ▼                                                                              │
│   SQLite Database (`0001_initial_migration.sql`)                                       │
│   ├── `monitoring_sessions`       (Resumo geral da sessão de trabalho)                 │
│   ├── `posture_metrics_snapshots` (Médias e desvios agrupados minuto a minuto)         │
│   ├── `posture_alerts`            (Histórico de incidentes posturais persistentes)     │
│   └── `posture_calibrations`      (Valores neutros de referência do usuário)           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Detecção dos Pontos Corporais (Landmarks)

### 2.1 Modelos Necessários do MediaPipe

Para atender aos requisitos **RF-01**, **RF-02** e **RF-03**, o sistema deve utilizar dois detectores complementares (ou um detector unificado):

1. **`PoseLandmarker` (MediaPipe Pose - Modelo Lite ou Full)**:
   - Utilizado para rastrear a cintura escapular, tronco e relação cabeça-tronco.
   - **Keypoints essenciais:**
     - `NOSE (0)`: Ponto central da face.
     - `LEFT_EYE_INNER (1)`, `RIGHT_EYE_INNER (4)`: Alinhamento ocular.
     - `LEFT_EAR (7)`, `RIGHT_EAR (8)`: Determinação do vetor de inclinação lateral e anterior da cabeça.
     - `LEFT_SHOULDER (11)`, `RIGHT_SHOULDER (12)`: Linha escapular/biacromial (desnível e inclinação dos ombros).
     - `LEFT_ELBOW (13)`, `RIGHT_ELBOW (14)` *(opcional)*: Posição dos cotovelos quando visíveis na mesa.

2. **`FaceLandmarker` (MediaPipe Face Mesh - 468/478 pontos)**:
   - Utilizado para o cálculo de abertura ocular (**EAR**) e orientação tridimensional da cabeça (**Head Pose**).
   - **Keypoints essenciais para EAR (Eye Aspect Ratio):**
     - **Olho Esquerdo (6 pontos):** Cantos `[33, 133]`, Pálpebras superiores/inferiores `[160, 158, 144, 153]`.
     - **Olho Direito (6 pontos):** Cantos `[362, 263]`, Pálpebras superiores/inferiores `[385, 387, 373, 380]`.
   - **Keypoints essenciais para Pitch/Yaw/Roll da Cabeça:**
     - Pontos do contorno nasal, ponta do nariz (`1`), queixo (`152`), glabela (`10`) e têmporas.

---

## 3. Gerenciamento e Processamento das Detecções em Memória

### 3.1 Taxa de Amostragem (FPS) e Eficiência

Webcams padrão capturam a 30 FPS ou 60 FPS. No entanto, a biomecânica humana sentada em uma estação de trabalho evolui lentamente.
- Processar todos os 30 ou 60 frames por segundo com IA sobrecarrega a CPU/GPU desnecessariamente (violando **RQ-03**).
- **Taxa de inferência recomendada:** **10 a 12 FPS** (intervalo de ~80 a 100 ms entre inferências). Essa taxa garante detecção imediata de desvios posturais e captura precisa de piscadas (que duram entre 100 e 300 ms), consumindo até **65% menos energia**.

### 3.2 Filtragem de Ruído Temporal (Filtro Passa-Baixa / One Euro Filter)

Detecções de visão computacional em vídeo sofrem com micro-oscilações (*jitter*) decorrentes de iluminação variável ou ruído do sensor da câmera.
- Para evitar que o ângulo oscile erraticamente (ex: pulando de 14° para 16° em frações de segundo), deve-se aplicar uma **Média Móvel Exponencial (EMA)** ou um **One Euro Filter** sobre os ângulos calculados:
  $$\theta_{suavizado}(t) = \alpha \cdot \theta_{medido}(t) + (1 - \alpha) \cdot \theta_{suavizado}(t-1)$$
  Onde $\alpha \approx 0.25$ a $0.35$ equilibra resposta imediata e estabilidade visual.

### 3.3 Buffer Circular em Memória (Ring Buffer)

No frontend, as métricas de cada quadro processado são inseridas em um buffer circular de tamanho fixo em memória (ex: últimos 600 quadros $\approx$ 60 segundos a 10 FPS):
- Permite calcular métricas estatísticas em tempo real (média, desvio padrão, percentual em boa postura).
- Avalia a persistência temporal de um desvio postural antes de emitir qualquer alerta.
- **Descarte de dados brutos:** Ao final de cada ciclo de amostragem de 60 segundos, os dados brutos são descartados após a consolidação estatística, garantindo conformidade com a política de dados.

---

## 4. Classificação das Métricas: Bom vs. Atenção vs. Ruim

### 4.0 Abordagem Metodológica: Geometria Determinística vs. Machine Learning Próprio

Uma dúvida arquitetural comum é: **"É necessário treinar um modelo de Machine Learning (como SVM, Random Forest ou rede neural profunda) para classificar se a postura do usuário está boa ou ruim?"**

A resposta técnica é **NÃO**. O sistema utiliza **Geometria Computacional e Regras Biomecânicas Determinísticas**, sustentadas pelas seguintes razões:

1. **Separação de Papéis:** O aprendizado de máquina profundo já é executado pelo **MediaPipe**, cuja rede neural converte a matriz bruta de pixels em coordenadas cartesianas normalizadas $(x, y, z)$. Uma vez conhecidas as posições espaciais das articulações, a avaliação da postura torna-se um problema puramente geométrico e trigonométrico.
2. **Explicabilidade Científica para o TCC:** Modelos de classificação supervisionada atuam como caixas-pretas (*black boxes*), informando apenas uma probabilidade opaca (ex: "78% de chance de postura ruim"). Já as regras geométricas determinísticas permitem fundamentar com exatidão a causa raiz do alerta perante a banca e o usuário (ex: *"A inclinação cervical atingiu 24°, ultrapassando o limite neutro de 15° estipulado pela NR-17 e método RULA"*).
3. **Invariância Antropométrica via Calibração:** Um classificador de ML treinado com dados de terceiros falharia com facilidade diante de variações de altura de cadeira, enquadramento de câmera e roupas volumosas. A geometria com calibração base individual neutraliza essas variáveis.
4. **Custo Computacional Irrisório:** Operações trigonométricas (`atan2`, produto escalar e cálculo euclidiano) executam em **menos de 0.001 milissegundos** no TypeScript, garantindo 60 FPS de renderização visual no canvas com consumo de CPU próximo a zero.

```
Fluxo de Decisão:
┌─────────────────┐       ┌────────────────────────┐       ┌──────────────────────────┐
│ Frames da Vídeo │ ----> │ MediaPipe (IA Google)  │ ----> │ Coordenadas (x, y, z)    │
└─────────────────┘       └────────────────────────┘       └────────────┬─────────────┘
                                                                        │
                                                                        ▼
┌───────────────────────────┐       ┌──────────────────────┐       ┌──────────────────────────┐
│ Alerta Ergonômico / SQLite│ <---- │ Histerese (15-30 seg)│ <---- │ Desvio vs. Baseline (Δθ) │
└───────────────────────────┘       └──────────────────────┘       └──────────────────────────┘
```

### 4.1 A Importância da Calibração da Postura Base (Baseline)

Não existe uma altura universal de câmera nem um ângulo único válido para todos os usuários. Uma webcam instalada no topo de um monitor de 27 polegadas terá um ângulo de visão inclinado para baixo, enquanto a câmera de um notebook na mesa terá um ângulo de visão inclinado para cima.

Portanto, **a classificação postural deve ser relativa à postura neutra calibrada pelo próprio usuário**:
1. O usuário aciona o botão **"Calibrar Postura Base"**.
2. O sistema solicita 3 a 5 segundos de postura ereta ideal.
3. São calculadas e salvas as referências:
   - $\theta_{neck}^{base}$ (ângulo neutro de projeção/inclinação do pescoço);
   - $balance_{shoulder}^{base}$ (diferença neutra de altura dos ombros);
   - $dist_{tela}^{base}$ (distância facial de referência calibrada).

### 4.2 Definição das Métricas Biomecânicas e Limiares

Com base na literatura ergonômica de trabalho em computador (NR-17, ISO 9241-5 e bibliografia de ergonomia cérvico-escapular):

#### A. Inclinação do Pescoço / Projeção Anterior da Cabeça (Cervical Flexion)
- **Cálculo:** Ângulo do vetor que une a orelha/nariz ao ponto central entre os ombros, comparado à vertical anatômica e ao baseline:
  $$\Delta \theta_{neck} = |\theta_{neck}^{atual} - \theta_{neck}^{base}|$$
- **Classificação:**
  - **Bom (Verde):** Desvio $\Delta \theta_{neck} \le 12^\circ$.
  - **Atenção (Amarelo):** Desvio $12^\circ < \Delta \theta_{neck} \le 20^\circ$.
  - **Ruim / Crítico (Vermelho):** Desvio $\Delta \theta_{neck} > 20^\circ$.

#### B. Nivelamento Horizontal dos Ombros (Shoulder Balance)
- **Cálculo:** Ângulo da linha imaginária que conecta os ombros esquerdo e direito em relação ao eixo horizontal:
  $$\theta_{shoulder} = |\arctan2(y_{direito} - y_{esquerdo}, x_{direito} - x_{esquerdo})| \times \frac{180}{\pi}$$
  $$ShoulderBalance\% = \max(0, 100 - (\theta_{shoulder} \times 10))$$
- **Classificação:**
  - **Bom (Verde):** Desvio angular $\le 3^\circ$ (Balance $\ge 92\%$).
  - **Atenção (Amarelo):** Desvio angular entre $3^\circ$ e $6^\circ$ ($85\% \le Balance < 92\%$).
  - **Ruim / Crítico (Vermelho):** Desvio angular $> 6^\circ$ (Balance $< 85\%$).

#### C. Distância do Usuário ao Monitor (Screen Distance)
- **Cálculo:** Estimativa proporcional da distância através da distância interpupilar normalizada (IPD em pixels) ou largura biacromial comparada ao valor de calibração base de 60 cm:
  $$DistanciaCm = 60 \times \left(\frac{IPD_{calibrado}}{IPD_{atual}}\right)$$
- **Classificação (conforme NR-17 e literatura oftalmológica):**
  - **Bom (Verde):** $50\text{ cm} \le DistanciaCm \le 75\text{ cm}$.
  - **Atenção (Amarelo):** $40\text{ cm} \le DistanciaCm < 50\text{ cm}$ ou $75\text{ cm} < DistanciaCm \le 85\text{ cm}$.
  - **Ruim / Crítico (Vermelho):** $DistanciaCm < 40\text{ cm}$ (risco de astenopia/fadiga visual) ou $> 85\text{ cm}$ (postura forçada para leitura).

#### D. Padrão Ocular e Taxa de Piscadas (EAR & Blink Rate)
- **Cálculo de EAR (Soukupová & Čech, 2016):**
  $$EAR = \frac{||p_2 - p_6|| + ||p_3 - p_5||}{2 \times ||p_1 - p_4||}$$
- Uma piscada é registrada quando o EAR cai abaixo de $\approx 0.20$ por 2 a 4 frames (100 a 300 ms) e retorna ao nível normal ($> 0.25$).
- **Taxa de piscadas por minuto:**
  - **Normal:** 12 a 20 piscadas/minuto.
  - **Atenção (Alerta de Fadiga Visual / Olho Seco):** Menos de 8 piscadas/minuto sustentadas por mais de 2 minutos contínuos.

### 4.3 Histerese Temporal e Prevenção de Falsos Alertas

Um usuário pode se inclinar momentaneamente para pegar um objeto, beber água ou coçar o rosto. Isso **não constitui má postura**. Para evitar alertas repetitivos e irritantes (*alert fatigue*):
- **Janela de Confirmação Temporal (Threshold Duration):**
  - O status em tempo real da interface pode refletir o desvio imediato (feedback visual imediato no canvas).
  - Um **alerta ergonômico sonoro/notificação** só deve ser disparado se o desvio persistir de forma ininterrupta por **pelo menos 15 a 30 segundos**.
- **Cooldown entre Alertas (Suppress Window):** Após um alerta ser emitido para uma métrica, o mesmo alerta não se repete por pelo menos 2 a 3 minutos, a menos que o usuário retorne à boa postura e reincida no erro.

---

## 5. Estratégia de Registro e Persistência no SQLite

### 5.1 Por Que Não Persistir Detecção por Detecção?

A 10 FPS, uma jornada de 8 horas de monitoramento geraria **288.000 registros diários**. Persistir cada frame no SQLite provocaria:
- Esgotamento acelerado de ciclos de escrita do SSD;
- Arquivo do banco crescendo dezenas de megabytes por semana;
- Lentidão nas consultas históricas do dashboard;
- Violação do requisito **RQ-01** (conservar apenas métricas necessárias).

### 5.2 Modelo de Dados Proposto (Persistência em Três Níveis)

A persistência deve ocorrer em **3 níveis complementares**, seguindo estritamente as convenções da skill `backend-model-development` e inserida na migration `src-tauri/migrations/0001_initial_migration.sql`:

#### Nível 1: Sessão de Monitoramento (`monitoring_sessions`)
Registra cada período em que o usuário iniciou e pausou/finalizou o monitoramento contínuo:
- `id` (TEXT PRIMARY KEY - UUIDv4)
- `user_id` (INTEGER, nullable, FK para `users`)
- `started_at` (TEXT ISO8601)
- `ended_at` (TEXT ISO8601, nullable)
- `duration_seconds` (INTEGER)
- `average_score` (REAL - Ergo Score médio da sessão de 0 a 100)
- `good_posture_percentage` (REAL - 0 a 100%)
- `warning_posture_percentage` (REAL)
- `danger_posture_percentage` (REAL)
- `total_alerts_count` (INTEGER)
- `created_at`, `updated_at` (TEXT ISO8601)

#### Nível 2: Snapshots Agregados por Janela de Tempo (`posture_metrics_snapshots`)
Registrado pelo frontend a cada **1 minuto (60 segundos)** de monitoramento ativo:
- `id` (TEXT PRIMARY KEY - UUIDv4)
- `session_id` (TEXT NOT NULL, FK para `monitoring_sessions`)
- `timestamp` (TEXT ISO8601 NOT NULL)
- `avg_neck_angle` (REAL NOT NULL)
- `max_neck_angle` (REAL NOT NULL)
- `avg_shoulder_balance` (REAL NOT NULL)
- `min_shoulder_balance` (REAL NOT NULL)
- `avg_distance_cm` (REAL NOT NULL)
- `blink_count` (INTEGER NOT NULL - número de piscadas no minuto)
- `dominant_status` (TEXT NOT NULL - `'good'`, `'warning'`, `'danger'`)
- `score` (REAL NOT NULL - 0 a 100 daquele minuto)
- `samples_count` (INTEGER NOT NULL - ex: 600 quadros avaliados)
- `created_at` (TEXT ISO8601)

> **Volume:** Em 8 horas de trabalho contínuo, são gerados exatamente **480 registros** de 1 minuto. Extremamente leve, indexado por `timestamp`, ideal para desenhar gráficos temporais e curvas de fadiga no dashboard com resposta instantânea.

#### Nível 3: Eventos e Alertas Discretos (`posture_alerts`)
Registrado apenas quando um desvio sustentado atinge o limiar de notificação:
- `id` (TEXT PRIMARY KEY - UUIDv4)
- `session_id` (TEXT NOT NULL, FK para `monitoring_sessions`)
- `timestamp` (TEXT ISO8601 NOT NULL)
- `alert_type` (TEXT NOT NULL - `'neck_forward'`, `'shoulder_unbalance'`, `'screen_too_close'`, `'low_blinks'`, `'break_recommended'`)
- `severity` (TEXT NOT NULL - `'warning'`, `'danger'`)
- `duration_seconds` (INTEGER NOT NULL - tempo sustentado da má postura)
- `message` (TEXT NOT NULL)
- `resolved_at` (TEXT ISO8601, nullable - quando o usuário corrigiu a postura)
- `created_at` (TEXT ISO8601)

#### Nível 4: Calibração de Referência (`posture_calibrations`)
Registra os parâmetros anatômicos individuais da calibração ativa:
- `id` (TEXT PRIMARY KEY - UUIDv4)
- `user_id` (INTEGER, nullable)
- `baseline_neck_angle` (REAL NOT NULL)
- `baseline_shoulder_balance` (REAL NOT NULL)
- `baseline_distance_cm` (REAL NOT NULL)
- `baseline_eye_distance_px` (REAL NOT NULL)
- `is_active` (INTEGER NOT NULL DEFAULT 1)
- `created_at` (TEXT ISO8601)

---

## 6. O Que Mais Precisa Ser Analisado

Além dos ângulos básicos de pescoço e ombros, os seguintes fatores são indispensáveis para um sistema de visão ergonômico robusto e completo:

### 6.1 Detecção de Presença e Estado Ocioso (User Presence & Frame Validity)
- **Problema:** Se o usuário se levantar para tomar café ou atender alguém, o detector não encontra landmarks corporais.
- **Solução:** Implementar estados explícitos de monitoramento:
  - `ACTIVE`: Usuário presente e landmarks com alta confiança.
  - `ABSENT` / `NO_USER_DETECTED`: Nenhum corpo detectado por mais de 5 segundos. O timer de postura é pausado; métricas não são computadas e o banco não é poluído com valores nulos ou zeros.
  - `PARTIALLY_OCCLUDED`: Apenas parte do corpo visível (ex: ombros cortados pelo enquadramento). O sistema emite aviso de enquadramento ("Ajuste a câmera para enquadrar cabeça e ombros").

### 6.2 Confiança das Landmarks (Confidence Score)
- MediaPipe fornece `visibility` e `presence` para cada ponto corporal (0.0 a 1.0).
- Se a média de confiança dos ombros e orelhas for $< 0.65$ (por desfoque, movimento brusco ou oclusão), o quadro é marcado como **inválido** e descartado sem afetar a média.

### 6.3 Qualidade da Iluminação e Ambiente
- **Contraluz e Subexposição:** Um cálculo rápido de luminância média na região facial a partir dos pixels do canvas (usando a fórmula padrão $L = 0.299R + 0.587G + 0.114B$):
  - Se $L < 40$: iluminação insuficiente (pode gerar detecção imprecisa de piscadas e fadiga visual).
  - Se $L > 220$: saturação por luz solar direta ou janela de fundo.
  - Um aviso suave pode orientar o usuário: *"Ambiente com pouca iluminação. Isso pode forçar sua visão."*

### 6.4 Regra 20-20-20 e Fadiga por Imobilidade Postural
- Mesmo uma postura posturalmente "perfeita" torna-se prejudicial se mantida estática por horas seguidas sem variação articular.
- **Monitoramento de micro-pausas:** Integrar o módulo de postura ao módulo de lembretes (`reminders`):
  - A cada 20 minutos de tela contínua: disparar lembrete de descanso ocular (olhar para longe por 20 segundos).
  - A cada 50-60 minutos de trabalho contínuo: sugerir levantar, alongar e mudar de posição.

### 6.5 Política de Governança Local e Privacidade (LGPD / RN-07)
- O processamento de vídeo ocorre 100% na memória volátil da máquina.
- Nenhum frame é gravado em disco ou transmitido pela rede.
- Os dados do banco SQLite contêm exclusivamente grandezas físicas e resumos estatísticos (ex: `avg_neck_angle: 15.3`).

### 6.6 Concorrência de Câmera e Chamadas de Vídeo (Meet, Teams, Zoom)
- **Bloqueio Exclusivo do Hardware no Windows (*Exclusive Lock*):** No Windows, drivers de webcam física (UVC / DirectShow) alocam acesso exclusivo a um único aplicativo por vez. Se o Ergo estiver utilizando o feed da câmera e o usuário ingressar em uma videochamada no Google Meet, Microsoft Teams ou Zoom, o outro software exibirá erro de *"Dispositivo em uso"*.
- **Estratégia de Tratamento Gracioso:**
  - O frontend deve interceptar os erros `NotReadableError` e `TrackStartError` do `getUserMedia`, além de monitorar o evento `stream.getVideoTracks()[0].onended`.
  - Ao detectar concorrência de dispositivo, o monitoramento deve entrar automaticamente no estado `PAUSED_BY_HARDWARE_BUSY` (*"Câmera em uso por outro aplicativo"*), liberando o descritor de arquivo do dispositivo.
  - Exibir botão de retomada imediata de monitoramento (*"Retomar Monitoramento"*) assim que a chamada de vídeo for encerrada.

---

## 7. Roteiro Passo a Passo de Implementação

### Fase 1: Visão Computacional no Frontend (MediaPipe Tasks)
1. Instalar as dependências do MediaPipe Tasks Vision no frontend:
   ```bash
   npm install @mediapipe/tasks-vision
   ```
2. Baixar os modelos binários Wasm e TFLite (`pose_landmarker_lite.task` e `face_landmarker.task`) para a pasta `public/models/` para permitir execução 100% offline.
3. Criar o serviço `src/services/vision/poseDetector.ts` que inicializa os modelos em WebAssembly e expõe métodos limpos de inferência por frame.
4. Conectar o `WebcamFeed.tsx` ao detector real, substituindo as fórmulas com `Math.sin`/`Math.cos` por coordenadas extraídas em tempo real.

### Fase 2: Módulo de Cálculo Biomecânico e Calibração
1. Criar `src/services/vision/biomechanics.ts` com funções puras e testáveis:
   - `calculateNeckAngle(ear, nose, shoulderCenter, baseline)`
   - `calculateShoulderBalance(leftShoulder, rightShoulder)`
   - `calculateEAR(eyeLandmarks)`
   - `estimateDistance(interpupillaryDistancePx, baseline)`
2. Criar gerenciador de histerese temporal `src/services/vision/temporalPostureFilter.ts` com buffer circular de 60 segundos e limiares de duração.
3. Atualizar o modal `WorkspaceCalibrationModal.tsx` para guiar a calibração de 3 segundos e salvar as métricas neutras de base.

### Fase 3: Backend Rust (Models, Repositories, Services, Commands)
Seguindo estritamente a skill `backend-model-development`:
1. **Migration Única (`0001_initial_migration.sql`):** Adicionar as tabelas `monitoring_sessions`, `posture_metrics_snapshots`, `posture_alerts` e `posture_calibrations`.
2. **Models (`src-tauri/src/models/posture.rs`):** Declarar structs e payloads serializáveis em `camelCase`.
3. **Repository (`src-tauri/src/repositories/posture_repository.rs`):** Implementar queries de inserção em lote para snapshots e busca agregada para o dashboard.
4. **Service (`src-tauri/src/services/posture_service.rs`):** Regras de consolidação de sessão, cálculo de métricas médias e testes unitários in-memory.
5. **Commands (`src-tauri/src/commands/posture.rs`):** Comandos IPC (`start_monitoring_session`, `end_monitoring_session`, `record_metric_snapshot`, `record_posture_alert`, `get_posture_history`).
6. **Registro em `lib.rs`:** Declarar módulos e registrar os comandos no `invoke_handler`.

### Fase 4: Integração Frontend -> Backend
1. Criar `src/services/postureService.ts` com métodos `invoke` correspondentes.
2. Integrar o ciclo de vida de monitoramento em `src/pages/Monitoring.tsx`:
   - Ao clicar em "Iniciar Monitoramento": chama `start_monitoring_session`.
   - A cada 60 segundos de captura ativa: despacha `record_metric_snapshot` com o resumo do buffer.
   - Quando um desvio persistente ultrapassa 20 segundos: despacha `record_posture_alert` e emite alerta sonoro.
   - Ao pausar ou sair da tela: chama `end_monitoring_session`.

### Fase 5: Conexão com o Dashboard Histórico
1. Atualizar os componentes de dashboard (`src/pages/Home.tsx` / `DashboardWidgets.tsx`) para consumir os dados reais salvos no SQLite, exibindo evolução diária/semanal do Ergo Score, tempo em postura correta e histórico de alertas.
