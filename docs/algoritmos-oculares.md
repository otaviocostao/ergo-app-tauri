# Task 3.4: EAR, piscadas e distância da tela

## Reconhecimento e convenções

O trabalho começou em `feat/distanciaDeTelaEPiscada`, com árvore limpa no commit
`873edfe`. O histórico completo, incluindo os caminhos de visão e mensagens com
`vis`, mostra Tasks 3.1–3.3 em commits de implementação, testes e documentação.
Há uso de `feat:`, `test:`, `docs:`, `refactor:` e `chore:`, inclusive com escopos.
Esta task mantém mensagens locais em português, minúsculas e sem escopo.

O projeto usa npm (`package-lock.json`), TypeScript estrito, imports relativos e
Vitest com testes ao lado do código. Não foram encontrados AGENTS/CLAUDE,
CONTRIBUTING, ADRs, configuração de ESLint/Prettier, scripts de lint/typecheck
ou hooks ativos. A verificação de tipos usa o TypeScript instalado.

`biomechanics.ts` já tinha funções puras que retornam `null` para medidas
inválidas. A implementação coberta por `headPitch.test.ts` é
`calculateHeadPitch`, nesse mesmo módulo. As funções e os testes geométricos
anteriores foram preservados; os novos casos foram acrescentados.

`PoseDetectorService` já inicializa **PoseLandmarker e FaceLandmarker**, com
modelos e WASM locais. Pose tem 33 pontos; Face tem 468/478 pontos. Não foi
necessário instalar dependências, modelos ou criar outra captura. O tipo
`LandmarkPoint` existente tem x/y normalizados, z relativo e visibility/presence.
O adaptador ocular reutiliza esse tipo e `Point2D`.

## APIs e geometria

Todas as APIs novas são exportadas por `src/services/vision/index.ts`.

| API | Contrato |
| --- | --- |
| `calculateEAR(points)` | Exatamente seis pontos P1..P6 em pixels; `(dist(P2,P6) + dist(P3,P5)) / (2 * dist(P1,P4))`. Resultado adimensional ou `null`. |
| `calculateMeanEAR(left, right)` | Média dos EARs válidos; usa um olho quando o outro estiver indisponível. Zero é uma abertura válida. |
| `normalizedPointToPixels(point, width, height)` | Converte x pela largura e y pela altura reais do frame, corrigindo a proporção da imagem. |
| `getEyeLandmarksInPixels(...)`, `calculateFaceEAR(...)` | Adaptam a malha facial para a ordem canônica e descartam pontos com confiança ≤ 0,35. |
| `calculateInterpupillaryDistance(...)` | Retorna `{distancePx, source}`. Prefere íris 468/473; fallback para os pontos médios dos dois pares de cantos. |
| `estimateScreenDistance(ipdPx, baseline)` | Retorna `baselineDistanceCm * (baselineEyeDistancePx / ipdPx)` em cm, sem filtros. |
| `clampScreenDistance(cm, min, max)` | Limita a faixa de exibição, por padrão 20–150 cm. |
| `smoothScreenDistance(cm, previous, alpha)` | EMA independente, α padrão 0,3; `previous = null` reinicia na medida atual. |
| `isScreenDistancePoseUsable(matrix, maxDegrees)` | Reutiliza a validação do pitch e calcula yaw; limite experimental padrão de 25° para ambos. |

EAR recebe pixels, nunca coordenadas normalizadas diretamente. O adaptador usa
`video.videoWidth`/`video.videoHeight`, independentemente do canvas, do recorte
ou do espelhamento da prévia. Coordenadas inválidas, overflow e separações
oculares ≤ `1e-8` px resultam em `null`.

Os nomes legados de `FACE_LANDMARK_INDEX.LEFT_EYE/RIGHT_EYE` e seus arrays `ALL`
foram preservados. Esses arrays colocam os dois cantos primeiro e **não** servem
diretamente para EAR. `FACE_EAR_INDEX` usa os lados anatômicos do sujeito e P1..P6:
direito `[33,160,158,133,153,144]`, esquerdo `[362,385,387,263,373,380]`.
O mapeamento foi conferido com o [grafo oficial de refinamento facial](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_landmark/tensors_to_face_landmarks_with_attention.pbtxt).

## Calibração e distância

`ScreenDistanceBaseline` é um `Pick` de `PostureCalibrationDTO`, reutilizando
`baselineEyeDistancePx` e `baselineDistanceCm`, sem criar outro schema com
`ipdPx`/`distanceCm`. O serviço IPC de calibração já existe, mas o assistente
atual salva a configuração do ambiente e ainda não coleta essa referência.

O cálculo bruto aceita os campos existentes. A integração exige também
`ScreenDistanceReference`: largura/altura do frame e `source` (`iris` ou
`eye-corners`). Esses metadados adicionais só existem no contexto em memória;
não são inventados ao carregar um DTO antigo. O chamador deve invalidá-los ao
trocar câmera, lente, zoom ou ambiente. Mudanças de resolução suspendem a
estimativa. A integração exige o método calibrado e não troca silenciosamente
de íris para cantos durante uma oclusão.

Sem referência, IPD válida ou orientação frontal, a distância é `null`.
`WebcamFeedProps.onPostureUpdate.distanceCm` agora aceita `number | null` e o
cartão indica que aguarda calibração. A antiga heurística pela largura dos
ombros foi substituída para não alimentar o score e os alertas com centímetros
sem referência. Os filtros da distância não alteram a suavização dos ângulos.

A precisão depende da calibração e da perspectiva. Cantos são uma aproximação
dos centros pupilares. Yaw/pitch reduzem a separação aparente e superestimam a
distância; o gate invalida essas medidas sem impedir a contagem de piscadas.
O modelo estima distância à câmera, uma aproximação da distância à tela quando
a webcam está junto ao monitor. Não há validação métrica com câmera física nesta task.

## Detector e janela temporal

`createBlinkState` e `updateBlinkState` são transições puras. Todos os tempos
são timestamps monotônicos em **ms**, injetados pelo chamador. Os padrões estão
em `ocularConfig.ts` e podem ser substituídos nas APIs individuais:

- fecha quando EAR < 0,20; reabre quando EAR ≥ 0,23;
- conta uma piscada ao reabrir depois de 70–300 ms, inclusive (compatível com a amostragem de ~90 ms da inferência);
- descarta fechamentos mais curtos;
- emite `prolonged-closure` uma vez ao observar duração > 300 ms, mesmo antes da
  reabertura; não o interpreta como piscada normal ou diagnóstico de micro-sono;
- ausência de rosto/EAR, tempo inválido, amostras repetidas/fora de ordem ou gap
  > 250 ms descartam o fechamento pendente;
- após uma interrupção ou início com olhos fechados, exige um olho aberto para armar.

`createBlinkRateState` e `updateBlinkRate` mantêm eventos e intervalos observados
na janela deslizante `(agora - 60000, agora]`. Intervalos contínuos são unidos;
dados antigos são descartados e intervalos que cruzam o limite são recortados.
Só há tempo observado entre duas amostras disponíveis separadas por ≤ 250 ms.
Ausência não entra no denominador nem gera piscadas.

Antes de 30 s efetivamente observados, `blinksPerMinute` é `null` e
`isWarmingUp` é verdadeiro. Depois, a taxa é `contagem * 60000 / observedMs`;
`observedMs` e a contagem continuam expostos para interpretar janelas parciais.
A janela, o aquecimento e o gap são configuráveis em `BlinkRateConfig`.

`classifyBlinkRate` retorna `null` sem taxa válida. Os limiares experimentais
padrão são `<5` → `high-risk`, `[5,8)` → `attention`, `≥8` → `normal`, com
limiares configuráveis. Os nomes classificam frequência baixa de piscadas;
não representam diagnóstico de fadiga, olho seco ou risco individual de doença.
Não disparam notificações. A regra de alerta sustentado por dois minutos do
planejamento continua para o futuro motor de alertas.

## Integração e limites

`updateOcularMetrics(state, detection, width, height, reference)` compõe as
funções sem dependência de React. `WebcamFeed` o executa no loop existente,
usando `detection.timestamp` e sem exigir ombros detectados. `onOcularUpdate`
publica EAR, método/IPD, distância bruta/filtrada, evento de piscada, contagem na
janela, taxa, tempo observado e classificação. Publica `null` ao interromper a
captura; o estado reinicia em pausa, mute, troca de câmera ou falha de hardware.

O cartão **Taxa de Piscadas** usa essas medidas reais e aguarda o aquecimento.
O modal continua responsável pela configuração do ambiente. Não foi adicionado
um fluxo parcial de calibração nem persistência por frame em Rust.

A inferência permanece a aproximadamente 11 FPS (90 ms) conforme a Task 3.2.
A máquina de estados usa tempo, mas essa amostragem pode perder piscadas curtas
ou alterar sua duração aparente em até um intervalo de amostragem por borda.
Os testes a 15/30/60 FPS verificam o algoritmo; não demonstram precisão do
modelo, limiares universais nem precisão a 11 FPS em uma webcam física.

Próximas tarefas: coleta de baseline a uma distância conhecida, persistência e
invalidação dos metadados de câmera/método/resolução, calibração individual do
EAR, avaliação com sequências anotadas, medição de desempenho e integração de
agregados/eventos com as sessões e o motor de alertas.

## Verificação

Antes das mudanças: `tsc --noEmit` aprovado e 237 testes Vitest aprovados.
Não há script/configuração de lint; `npm run lint --if-present` apenas confirma
essa ausência. Não foi instalado outro linter nem alterado o processo do projeto.

No PowerShell, com uma instalação funcional do Node disponível no PATH:

```powershell
npx.cmd --no-install tsc --noEmit
npm.cmd run lint --if-present
npm.cmd test
npm.cmd run build
```

Neste ambiente, o shim padrão do NVM estava sem versão ativa. Foi usado o Node
22.23.2 já instalado, sem alterar a configuração global. O sandbox impedia o
Node de resolver o workspace (`EPERM`); as verificações foram executadas com
a permissão de execução local concedida pela ferramenta.

Testes determinísticos cobrem geometria, dados inválidos, escala/translação,
aspect ratio, íris/fallback, baseline/filtros, histerese, duração, FPS variável,
perda de rosto, janela/aquecimento, limites da classificação e integração DOM.
Build de produção aprovado; Vite avisa que o bundle principal excede 500 kB.
Os testes simulam detector e captura. A conferência com câmera física permanece
necessária: observar aquecimento, piscar, cobrir o rosto, pausar/retomar, testar
mute e bloqueio do dispositivo, verificando que não aparecem contagens falsas.

## Fontes e parâmetros experimentais

A fórmula de EAR segue [Soukupová e Čech (2016)](https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf).
O artigo fundamenta a métrica e a análise temporal; os limiares desta task são
configuração experimental do Ergo.

[Tsubota e Nakamori (1993)](https://doi.org/10.1056/NEJM199302253280817)
observaram médias de 22 piscadas/min em repouso e 7 durante uso de terminal,
com grande variação. Esses dados fundamentam a direção da redução observada;
não validam os cortes 5/8 adotados aqui. O corte de atenção abaixo de 8 também
aparece no planejamento do projeto. A bibliografia e os testes não comprovam
eficácia clínica do aplicativo.
