# Task 4.5 — UI em tempo real e feedback visual

Implementação na branch `feat/IntegracaoIUFeedback`, a partir de `1ded57e`, com aprovação do checkpoint em 03/11/2026. Escopo: canvas e feedback, botões de sessão e Dashboard com histórico persistido. Os commits usam `feat: "descrição"`; não houve push.

## 1. Implementação e arquivos

### Canvas e feedback

- `src/components/monitoring/canvasFeedback.ts` e teste: suavização exclusiva das posições desenhadas, projeção espelhada e recorte central, armazenamento reutilizado e invalidação de posições antigas.
- `src/components/monitoring/lightingFeedback.ts` e teste: indicador local de luminosidade com persistência e recuperação temporal.
- `src/components/monitoring/WebcamFeed.tsx` e teste: desenho com DPR, cores do classificador, badges cervical/ombros/distância, avisos de enquadramento, distância e iluminação. Captura e inferência continuam compartilhadas com a calibração.
- `src/components/monitoring/WorkspaceCalibrationModal.test.tsx`: mock de canvas atualizado para as operações utilizadas pelo feed. Nenhuma mudança na lógica da calibração.

### Sessões

- `src/hooks/useMetricRecording.ts` e teste: estados de ciclo de vida, duração medida, nova tentativa de fechamento, resolução de alertas pendentes e espera das gravações. A fila existente continua sendo o único ciclo de abertura/encerramento.
- `src/pages/Monitoring.tsx` e teste: início explícito, bloqueio síncrono de cliques duplicados, câmera ativa após abertura, encerramento e mensagens de falha. Atualização das métricas de UI limitada a aproximadamente 4 Hz; todas as classificações continuam chegando ao gravador e à histerese.
- Cancelamento durante abertura fecha a sessão que eventualmente retornar, sem registrar os valores iniciais de 100% do backend como medidas reais. Falha de fechamento mantém uma operação pendente e impede abrir outra sessão até ela ser concluída.

### Dashboard

- `src-tauri/src/models/dashboard.rs`, `repositories/dashboard_repository.rs`, `services/dashboard_service.rs`, `commands/dashboard.rs`, respectivos `mod.rs` e `lib.rs`: leitura específica em camadas, vinculada à conta autenticada no Rust e sem parâmetro de proprietário no frontend.
- `src/types/dashboard.ts`, `src/services/dashboardService.ts` e teste: contrato IPC e indisponibilidade explícita no preview web.
- `src/services/dashboardMetrics.ts` e teste: resumos de sessões encerradas ponderados por duração; gráfico do score persistido ponderado pelas amostras; calendário local e horários sem leituras.
- `src/pages/Dashboard.tsx` e teste: widgets reais, carregamento, vazio, erro, nova tentativa, invalidação de respostas após troca de conta e espera das gravações da página anterior. `Home.tsx` permanece intacto porque não é a página inicial usada pelas rotas.
- `src/components/reports/ReportWidgets.tsx` e teste: o gráfico existente aceita score com unidade própria; seu uso anterior nos relatórios permanece como percentual.
- `README.md`: comportamento da Task 4.5 e distinção entre Dashboard real e relatórios demonstrativos.

## 2. Mapa de requisitos e evidências

As linhas abaixo correspondem à implementação entregue; os testes estão junto aos arquivos indicados.

| Requisito | Evidência |
| --- | --- |
| Esqueleto anatômico suavizado sem alterar medidas | `src/components/monitoring/canvasFeedback.ts:25` e `:37`; integração em `WebcamFeed.tsx` |
| Cores da classificação existente | `src/components/monitoring/canvasFeedback.ts:4`; linhas e articulações usam `metricColor` em `WebcamFeed.tsx` |
| Espelhamento, recorte e DPR | `src/components/monitoring/canvasFeedback.ts:37`; `src/components/monitoring/WebcamFeed.tsx:474` |
| Badges com valor/unidade e ausência explícita | `src/components/monitoring/WebcamFeed.tsx:889` |
| Avisos de enquadramento e distância | `src/components/monitoring/WebcamFeed.tsx:596` e `:900`; testes de pontos confiáveis fora do quadro |
| Iluminação local, com remoção após recuperação | `src/components/monitoring/lightingFeedback.ts:12`; `WebcamFeed.tsx:507` e `:899` |
| UI moderada e gravação por inferência | `src/pages/Monitoring.tsx:151` e `:269`; callback de classificação continua executando histerese e gravador a cada inferência |
| Botões e estados assíncronos | `src/pages/Monitoring.tsx:106`; `src/components/monitoring/WebcamFeed.tsx:988` |
| Um único ciclo de sessões e recuperação de falhas | `src/hooks/useMetricRecording.ts`; testes de StrictMode, abertura tardia, escritas pendentes e nova tentativa |
| Encerrar aguarda escritas, resolve alertas e salva resumo | cleanup e operação `close` em `src/hooks/useMetricRecording.ts`; câmera condicionada a `captureEnabled` em `Monitoring.tsx:103` |
| Leitura autenticada em camadas | `src-tauri/src/commands/dashboard.rs:8`, `services/dashboard_service.rs:8`, `repositories/dashboard_repository.rs:10` |
| NULL preservado, sem média anatômica inventada | mapper existente reutilizado no novo repository; testes Rust preservam `None`; `dashboardMetrics.test.ts` usa snapshots com métricas NULL |
| Widgets reais com carregamento/vazio/erro | `src/pages/Dashboard.tsx:54` e `:64` |
| Troca de conta sem mostrar resposta antiga | contexto `owner` e cancelamento da leitura em `src/pages/Dashboard.tsx`; teste de resposta atrasada |
| Nenhum fallback simulado novo | `src/services/dashboardService.ts`; serviço rejeita leitura fora do Tauri |
| Dashboard aguarda a persistência da tela anterior | `src/pages/Dashboard.tsx:44`; teste de leitura bloqueada enquanto há gravações pendentes |

## 3. Verificação real

| Verificação | Linha de base | Entrega |
| --- | --- | --- |
| Vitest | 623 testes, 23 arquivos; todos passaram | **649 testes, 29 arquivos; todos passaram** |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | 90 passaram, 0 falharam | **92 passaram, 0 falharam** |
| `npm run build` | Passou | **Passou** |
| `git diff --check` | Sem alterações locais | Conferido durante a entrega |

Frontend executado com o Node **22.23.2 já instalado**, usando seu caminho absoluto. Não houve instalação nem alteração de dependências ou configuração global do Node. Os shims no PATH inicialmente não tinham versão ativa. Uma tentativa de referência com Node 22.11 apresentou 492 testes aprovados e seis erros de carregamento do jsdom; isso foi resolvido usando o runtime compatível já disponível.

Durante a implementação, a suíte completa identificou mocks de canvas sem `setTransform` nos testes de calibração; os mocks foram adequados e os 21 testes originais de calibração passaram. O build também identificou uso de `Array.at` incompatível com o alvo TypeScript existente; os testes foram ajustados sem alterar o alvo.

O build mantém o aviso preexistente de bundle acima de 500 kB (bundle JavaScript final de aproximadamente 691 kB antes de gzip). Não foi feito trabalho de otimização de bundle fora desta task.

Os testes Rust usam SQLite em memória ou arquivos temporários. As novas leituras não abrem um banco por conta própria: recebem a conexão da arquitetura existente. Nenhum `ergo.db`, `ergo.db-wal` ou `ergo.db-shm` existente foi aberto, removido ou modificado pela execução desta tarefa.

**NÃO VERIFICADO:** interação visual no aplicativo Tauri, permissões e disponibilidade de webcam física, CPU/GPU em uso real, escala física do Windows e calibração fotométrica dos parâmetros de iluminação. Não há ferramenta de interação visual nesta sessão. Na Fase 1, a prévia Vite iniciou e respondeu HTTP 200; isso verifica execução do frontend, não o comportamento físico da câmera nem integração real do WebView com o IPC.

## 4. Roteiro manual para reproduzir

Use uma conta de teste em ambiente com dados descartáveis; o roteiro abaixo cria sessões e métricas. Não é necessário apagar ou recriar banco.

1. Execute `npm run tauri dev` com Node compatível e entre na conta de teste.
2. Abra Monitoramento. Confirme câmera inicialmente desligada e ausência de sessão nova até clicar em **Iniciar Monitoramento**.
3. Clique rapidamente várias vezes: deve existir uma única abertura. Durante a operação, o botão deve indicar início e ficar desabilitado. Negue a câmera, confira a mensagem e tente novamente; encerre a sessão ao terminar.
4. Calibre pelos passos existentes e monitore com rosto e ombros visíveis. Mova cabeça/ombros, observe esqueleto e badges, redimensione a janela e confira o alinhamento espelhado. Repita com outra escala de tela do Windows.
5. Retire rosto/ombros do quadro e retorne; confira avisos e valores indisponíveis. Ajuste a distância e confira que o aviso desaparece ao voltar à faixa do classificador.
6. Reduza a iluminação por mais de 2 segundos e depois ilumine o rosto por mais de 1 segundo. Confira a entrada e saída do aviso, considerando exposição automática e contraluz.
7. Mantenha leituras válidas por pelo menos um minuto completo. Encerre: a câmera deve parar, as gravações devem terminar e o botão voltar ao estado inicial. Abrir e fechar calibração deve preservar o estado anterior de execução, conforme o ciclo existente.
8. Abra Início e confira percentual, tempo em boa postura, episódios e gráfico do score salvo. Sessão sem minuto completo pode ter resumo, mas não terá snapshot no gráfico. A meta deve estar identificada como demonstrativa, e pausas como **Não registrado**.
9. Saia do Monitoramento diretamente para Início enquanto há gravação pendente; a leitura deve aguardar a fila. Reinicie o app e confirme que os dados continuam presentes.
10. Entre em outra conta: o Dashboard não deve apresentar o histórico da anterior. Uma conta sem registros deve mostrar vazio. No preview web, não devem aparecer métricas simuladas.
11. Em ambiente de teste, simule falha de IPC no início, resolução de alerta e encerramento. Confira mensagem, nova tentativa, bloqueio de abertura sobre fechamento pendente e ausência de duplicação. Os testes automatizados já exercitam essas falhas com IPC simulado.

## 5. Decisões e limites

- **Aprovado no checkpoint:** implementar na página realmente roteada, `Dashboard.tsx`; sem criar outra tela nem ativar `Home.tsx`.
- **Aprovado:** nova leitura autenticada usa `AuthState`, sem modificar a autorização dos comandos antigos nem o schema.
- **Aprovado:** índice significa percentual de boa postura, ponderado pela duração registrada. O score persistido continua sendo uma medida diferente, usada no gráfico e identificada como tal. A classificação e a fórmula do score não foram alteradas.
- **Aprovado:** resumos contam no dia local de início da sessão. Sessões que cruzam a meia-noite não têm seu resumo repartido, porque não existe distribuição temporal suficiente para reconstruir exatamente esse tempo. Snapshots e alertas são agrupados por seus próprios timestamps.
- **Aprovado:** pausas não são deduzidas de encerramentos; a meta de 6h é demonstrativa. Relatórios detalhados continuam demonstrativos e são identificados no link de acesso.
- **Provisório, aprovado para esta implementação:** iluminação em 32 × 18 pixels, no máximo 2 Hz; escuro abaixo de 40/255 por 2 s, recuperação acima de 55/255 por 1 s. Exposição automática e fundo claro podem influenciar a estimativa. Não se deduz iluminação ruim apenas pela ausência de landmarks.
- A interpolação visual usa constante de tempo de 80 ms, preservando a tolerância já existente de 300 ms para posições antigas. Somente o desenho usa posições interpoladas.
- Métricas anatômicas NULL permanecem NULL no contrato e não viram zero. O Dashboard não reconstrói médias anatômicas globais: não há contagens válidas por métrica para isso. O gráfico calcula exclusivamente a média do score existente, ponderada por `samplesCount > 0`.
- Convidado: o gravador continua aceitando `userId: null`, como antes. As rotas internas continuam exigindo autenticação; a nova leitura do Dashboard rejeita convidado e anônimo. Não foi ampliado o acesso.
- Falhas de fechamento podem ser repetidas e retentadas enquanto o processo estiver vivo. A task não adiciona recuperação durável após encerramento forçado do processo, nem um novo mecanismo paralelo de sessão.

## 6. Observações fora do escopo, não alteradas

- Comandos antigos de workspace, calibração, sessões, snapshots e alertas continuam com suas limitações de autorização; a nova leitura protegida não corrige os endpoints anteriores.
- Workspaces continuam sem proprietário; o fallback de calibração ativa e o contexto incompleto da calibração de distância permanecem como estavam.
- Alguns serviços antigos de preview e os relatórios detalhados ainda têm fontes demonstrativas. Não foram expandidos.
- Indicadores preexistentes de coluna, digitação e histórico visual ainda têm textos/valores demonstrativos sem base suficiente para torná-los métricas reais nesta task.
- Limiares científicos e fórmulas anteriores continuam pendentes de validação formal. As cores consomem seus status existentes e não representam aprovação clínica desses parâmetros.
- Documentação histórica fora dos trechos diretamente relacionados à Task 4.5 pode permanecer defasada.

## 7. Confirmação de escopo

As alterações se limitam à Task 4.5, seus testes, registros de módulos/comando e documentação correspondente. Não foram alterados dependências, esquema, migração inicial, modelos de visão, algoritmos de classificação/histerese, calibração, agregação de métricas ou política de descarte/persistência da Task 4.4. O hook recebeu somente as mudanças necessárias para orquestrar o mesmo ciclo e consumir seus resultados com segurança na UI. Nenhum banco existente foi apagado. Não houve push.
