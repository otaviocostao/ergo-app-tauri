# Task 4.2 — Filtro temporal dos ângulos

`TemporalPostureFilter`, exportado pelo módulo `src/services/vision`, aplica One Euro independentemente aos ângulos do pescoço e dos ombros, em graus. Substitui a EMA angular de fator fixo do feed. O algoritmo segue a [referência de Casiez, Roussel e Vogel](https://gery.casiez.net/1euro/), incluindo a estimativa de velocidade a partir do valor filtrado anterior.

## Contrato

```ts
import { TemporalPostureFilter } from "../src/services/vision";

const filter = new TemporalPostureFilter();
const angles = filter.filter({ neckAngle: 12.25, shoulderAngle: 3.5 }, 100);
// Primeira amostra: { neckAngle: 12.25, shoulderAngle: 3.5 }
const next = filter.filter({ neckAngle: 13, shoulderAngle: 3.8 }, 190);
filter.reset();
```

`filter(rawAngles: PostureAngles, timestampMs: number): PostureAngles | null` recebe o timestamp monotônico da inferência em **milissegundos**, converte o intervalo para segundos e devolve valores sem arredondamento. Cada instância mantém seu próprio histórico, sem modificar os objetos recebidos. O resultado também não expõe o estado interno.

| Parâmetro | Padrão do projeto | Efeito |
| --- | --- | --- |
| `minCutoff` | 1 Hz | Corte mínimo; diminuir suaviza mais os movimentos lentos. |
| `beta` | 0,02 Hz por grau/segundo | Aumentar reduz o atraso nos movimentos rápidos; zero desativa a adaptação. |
| `derivativeCutoff` | 1 Hz | Corte da suavização da velocidade estimada. |
| `maxGapMs` | 1000 ms | Intervalos estritamente maiores iniciam uma nova sequência. |

O corte adaptativo é `minCutoff + beta × abs(velocidade filtrada)`. Para cada passa-baixa, `alpha = 1 / (1 + 1 / (2π × cutoff × dt))`, com `dt` em segundos. Os padrões são parâmetros iniciais do Ergo, sujeitos a avaliação com câmera física.

Cortes e `maxGapMs` devem ser positivos e finitos; `beta` deve ser finito e não negativo. A construção com configuração inválida lança `RangeError`. Amostras com valores não finitos, timestamp negativo, repetido ou regressivo, ou cálculo que cause overflow retornam `null` sem avançar nenhum dos canais. A primeira amostra válida, a primeira após `reset()` e a primeira depois de um gap maior que `maxGapMs` são devolvidas sem suavização. Após reset, um novo relógio monotônico pode começar em zero.

## Integração

O `WebcamFeed` mantém a instância em `useRef` e chama o filtro uma vez por inferência válida, com `detection.timestamp`. O pescoço continua usando `max(ângulo 2D, abs(pitch))` antes da filtragem, impedindo cancelamento entre desvios para cima e para baixo. Os ombros usam `calculateShoulderAngle`, que preserva a inclinação aguda de 0° a 90°, inclusive acima de 10°. `calculatePoseAngles` mantém `shoulderBalance` e acrescenta `shoulderAngle`.

Depois da filtragem, os ombros são convertidos por `max(0, min(100, 100 - shoulderAngle × 10))`. A classificação e as cores usam as métricas filtradas com precisão decimal; os callbacks existentes continuam arredondando para a interface. A geometria dos pontos do overlay continua acompanhando os landmarks detectados.

Pausa, encerramento ou troca de câmera, mute/unmute, perda do hardware e presença parcial/ausência reiniciam o filtro. Uma breve falha de detecção que mantenha o rastreamento ativo preserva o histórico, sem inventar amostras. O limite de gap também reinicia o estado se o processamento ficar suspenso por mais de um segundo sem receber eventos de câmera.

O monitoramento e a captura de baseline passam pelo mesmo componente e pelo mesmo filtro. Distância, EAR e piscadas mantêm os tratamentos próprios. Esta task não altera limiares, histerese, cooldown, schema ou DTOs persistidos.

A coleta da Task 4.1 usa `onCalibrationFrame`, com os ângulos filtrados sem arredondamento e a IPD da mesma inferência. A estabilidade é avaliada separadamente nos ângulos brutos e na IPD; uma saída suavizada não basta para aprovar a coleta. Critérios e tratamento de dados ausentes estão no [guia de calibração](calibracao-postura.md).

## Verificação

Executar `npm test` e `npm run build`. A suíte inclui geometria dos ombros, independência dos canais, timestamps irregulares, entradas inválidas, reset e fronteira de 1000 ms, além das regressões da câmera e da calibração.

Os critérios quantitativos usam amostragem de 90 ms: 120 leituras alternando 9° e 11°, descartando as primeiras 20, devem ter erro RMS filtrado abaixo de metade do erro bruto; após estabilização em 0°, um degrau para 30° deve atingir 27° em até 500 ms. São verificações determinísticas do filtro, sem medir a precisão física do detector.

Para a conferência manual no aplicativo (`npm run tauri -- dev`):

1. Em **Monitoramento**, enquadrar rosto e ombros e manter postura estática; observar a estabilidade dos valores com pequenas mudanças de iluminação.
2. Inclinar a cabeça lentamente e depois rapidamente, inclusive para cima e para baixo. Confirmar acompanhamento, recuperação ao repouso e ausência de cancelamento entre sentidos opostos.
3. Inclinar os ombros e retornar ao alinhamento; verificar transição suave do indicador, inclusive após atingir 0%.
4. Pausar/retomar, trocar a câmera e interromper o stream. Confirmar que a primeira leitura válida usa a postura atual, sem carregar o histórico anterior.
5. Abrir a calibração, coletar os cinco segundos e salvar. Conferir métricas no modal e retomada do monitoramento ao fechar.

Registrar câmera, resolução, iluminação e parâmetros utilizados para qualquer ajuste dos padrões. Um pico de ruído pode ser interpretado como alta velocidade; o filtro reduz oscilações e não substitui a validação dos landmarks.
