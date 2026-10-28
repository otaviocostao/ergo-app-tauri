# Task 4.3 — Classificação e histerese temporal

## Classificação por inferência

`postureClassifier.ts` contém funções puras. Pescoço e ombros usam a magnitude da diferença entre o ângulo filtrado atual e a referência neutra. A distância já chega em centímetros pelo estimador ocular; não há conversão de unidade ou subtração dos 60 cm de referência.

| Métrica | Bom | Atenção | Ruim |
| --- | --- | --- | --- |
| Desvio do pescoço | ≤ 12° | > 12° e ≤ 20° | > 20° |
| Desvio dos ombros | ≤ 3° | > 3° e ≤ 6° | > 6° |
| Distância da tela | 50–75 cm, inclusive | 40–<50 cm ou >75–85 cm | <40 cm ou >85 cm |
| Frequência de piscadas | ≥ 8/min | < 8/min | Sem segundo nível nesta task |

Os estados reutilizam `PostureStatus`. A interface mantém seus rótulos existentes. A classificação geral é o pior nível disponível de pescoço, ombros e distância; frequência baixa de piscadas permanece independente.

Sem medição ou referência válida, o indicador recebe `null`, nunca um valor neutro inventado. A baseline dos ombros está persistida em porcentagem: `(100 - baselineShoulderBalance) / 10` recupera seu ângulo equivalente quando o balanceamento é maior que zero. Um valor de 0% está saturado e não determina um ângulo exato; esse indicador permanece indisponível e o cartão solicita recalibração.

`WebcamFeed` classifica uma vez por inferência, depois dos filtros e antes de arredondar os valores publicados para apresentação. `onClassificationUpdate` publica todas as métricas e o timestamp, inclusive quando algum canal está indisponível; envia `null` no reset da captura. O overlay e os cartões usam o mesmo resultado. O callback específico da calibração continua separado, pois seu bloqueio de orientação facial não deve esconder desvios altos durante o monitoramento.

## Tempo, continuidade e repetição

`postureClassificationConfig.ts` centraliza os limiares e tempos. Configurações customizadas são construídas por `createPostureClassificationConfig`, que valida e copia os valores e devolve objetos imutáveis. Não há tela nova de configurações.

- Persistência postural padrão: **mais de 20 segundos**; configurável entre 15 e 30 segundos.
- Persistência de piscadas baixas: **mais de 20 segundos**, configurável independentemente no mesmo intervalo.
- Cooldown padrão: **180 segundos**, configurável entre 120 e 180 segundos.
- Gap máximo entre observações: **250 ms**, configurável. Acima disso não se considera a condição contínua.

Os módulos recebem timestamps monotônicos em milissegundos. Produção usa o timestamp da inferência; testes fornecem números, sem sleeps ou threads novas. O horário civil é utilizado somente para apresentar o evento no histórico.

`PostureHysteresis` mantém estado independente por métrica. Atenção e Ruim são elegíveis para aviso. Entrar em um desses níveis inicia sua contagem; voltar a Bom, perder a leitura ou mudar de nível a reinicia. Uma troca de captura ou baseline também descarta a continuidade. O limite é estrito: exatamente 20.000 ms não libera o evento padrão.

A histerese retorna `alerts` uma única vez ao cruzar o limite e mantém `sustained` enquanto a condição continua elegível. O cooldown consulta somente as condições sustentadas atuais. A identidade é **métrica + nível**, independentemente do texto e, para distância, da direção perto/longe. Outros indicadores ou níveis não são bloqueados pela mesma chave.

O cooldown começa quando o evento é encaminhado ao canal existente. Uma condição contínua pode gerar outro aviso após 180.000 ms desde a última entrega, inclusive na fronteira exata, sem exigir recuperação intermediária. Se a condição se recuperar, nenhum evento antigo fica aguardando entrega.

Pausa e abertura da calibração descartam continuidade, preservando cooldown. Troca de conta limpa ambos. Callbacks obsoletos de um contexto anterior são ignorados. O estado pertence à página de monitoramento: sair da rota encerra essa instância, sem persistência entre navegações ou reinícios.

## Piscadas sustentadas

A detecção e a janela existentes são reutilizadas: janela deslizante de 60 segundos, pelo menos 30 segundos de observação válida e contagem por `blinkRate.ts`. A classificação permanece indisponível durante o aquecimento, mesmo se houver uma taxa provisória.

Somente depois de aquecer, uma frequência estritamente abaixo de 8/min inicia a mesma histerese usada pelos demais indicadores. Voltar a 8/min ou mais, ou perder a leitura ocular, reinicia sua persistência. O aquecimento não entra na duração sustentada. A indicação é experimental e não constitui diagnóstico.

## Saída e escopo

`Monitoring` recebe os resultados, aplica histerese/cooldown e acrescenta avisos ao **Histórico da Sessão** existente. As cores e níveis atuais mudam imediatamente; apenas a entrega de avisos é temporizada. Não foram adicionados componentes de UI, sons, notificações nativas, dependências, tabelas ou gravação de alertas/snapshots. O selo de resumo passou a consumir a classificação única em vez dos limiares da fórmula local anterior.

## Verificação

Executar `npm test`, `npm run build`, os scripts `test:birth-date`, `test:reports`, `test:reminders`, `test:theme` e `cargo test --manifest-path src-tauri/Cargo.toml`. O projeto não configura um script de lint; o build inclui a checagem estrita do TypeScript (`tsc --noEmit`).

Os testes cobrem fronteiras, sinais, entradas inválidas, baseline, aquecimento, persistência, recuperação, níveis independentes, repetição, cooldown, interrupções e o fluxo integrado com timestamps simulados. Webcam física, iluminação e adequação dos parâmetros ainda exigem validação manual.
