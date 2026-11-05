# Validação das mensagens de monitoramento

As mensagens foram verificadas em camadas: lógica temporal, componentes, gravação IPC, atualização do histórico, fluxo integrado com câmera simulada, consultas SQLite do backend e execução no Chrome com relógio real.

Resultado final: **737 testes Vitest em 36 arquivos, 109 testes Rust e build TypeScript/Vite aprovados**. Esta revisão acrescentou 25 testes: nove de câmera/tempo, quatro de atualização do histórico, três de notificação da gravação e nove do fluxo integrado. O build mantém o aviso anterior de bundle acima de 500 kB.

## Matriz automatizada

| Cenário | Resultado esperado e verificado |
| --- | --- |
| Iniciar sem pessoa na câmera | “Monitoramento iniciado” aparece após criar a sessão; não há ausência em 4.999 ms e há uma única mensagem em 5.000 ms com câmera disponível |
| Abertura de câmera em 0 ou 3 segundos | A ausência não recebe uma espera adicional após `getUserMedia` resolver; aparece aos cinco segundos do início |
| Câmera disponível apenas após seis segundos | Não há ausência enquanto inexiste câmera; assim que o fluxo fica disponível, o tempo já decorrido é considerado |
| Permanecer ausente | Sem repetição da mesma mensagem durante o episódio |
| Retornar após ausência | Um único “Usuário presente” por retorno confirmado |
| Oscilar entre enquadramento válido e parcial | Sem novo “Usuário presente” a cada oscilação |
| Pessoa visível com leitura incompleta | Enquadramento parcial; não confundir automaticamente com ausência |
| Encerrar e iniciar ainda ausente | Nova contagem de cinco segundos e novo aviso, mesmo sem retorno entre as sessões |
| Deixar a página parada antes de iniciar | O tempo na página não antecipa a ausência; a contagem começa ao iniciar |
| Adiantar ou atrasar o relógio do sistema em uma hora | A duração continua sendo cinco segundos pelo relógio monotônico |
| Suspender callbacks de desenho dos quadros | A verificação de ausência continua independente do `requestAnimationFrame` |
| Câmera em mute, bloqueada ou sem permissão | Não criar aviso de ausência por falta de acesso à câmera |
| Desmutar ou substituir uma captura | Retomar com leituras novas e respeitar o período de ausência da captura |
| Concorrência de câmera | Um aviso por mudança para bloqueio; seletor continua disponível para recuperar a câmera |
| Parar, desmontar ou abrir a calibragem | Não enviar presença/ausência da captura inativa; cancelar os verificadores ao desmontar/parar |
| Salvar calibragem e retomar | Confirmação de sucesso permanece visível quando a sessão anterior é substituída |
| Confirmar desvio postural | Manter os limites existentes de persistência superior a 20 segundos e registrar um alerta por episódio |
| Salvar ou resolver alerta | Atualizar a lista imediatamente após sucesso do IPC, sem aguardar o polling de cinco segundos |
| Gravação IPC pendente | Não anunciar o registro como salvo antes de a promessa resolver |
| Falha ao gravar alerta | Mostrar a falha; não inventar um alerta salvo. Um episódio posterior pode ser registrado normalmente |
| Falha ao gravar resumo ou finalizar sessão | Exibir o erro; preservar as regras de continuidade e repetição da finalização |
| Falha ao atualizar duração | Reportar o erro e tentar resolver o episódio pendente antes de encerrar a sessão |
| Gravação durante uma consulta antiga | Descartar a resposta antiga e consolidar as notificações em nova leitura sem consultas sobrepostas |
| Nova sessão enquanto a consulta ainda está pendente | Mostrar seu início e eventos novos com a linha efetivamente salva, sem usar a barra/alertas da sessão anterior |
| Pausa de digitação após encerrar sessão postural | A ação aparece na lista da conta e não é descartada por estar fora do intervalo gravado |
| Falha ao salvar a câmera padrão após encerrar | A mensagem aparece e informa que a câmera escolhida continua em uso |
| Apenas análise ocular, com sessão postural antiga no banco | Presença/ausência aparecem sem criar uma sessão postural fictícia |
| Trocar de conta ou receber evento de outra conta | Não mostrar mensagens nem executar consultas motivadas pela outra conta |
| Navegar para outra página | Monitoramento continua; a consulta do histórico é suspensa e atualizada ao retornar |
| Limpar a lista | Preservar o banco, esconder as entradas da tela e permitir alertas novos |
| React StrictMode | Não duplicar sessões, gravações ou verificadores |
| Reabrir o aplicativo | Recuperar sessão e alertas persistidos, sem inventar avisos temporários de uma execução anterior |

## Medição no navegador

No Chrome headless, com React, vídeo gerado por `canvas.captureStream`, MediaPipe e relógio reais, o tempo foi medido desde a criação da sessão até o aviso aparecer no DOM:

| Disponibilidade do vídeo sintético | Ausência exibida após o início |
| --- | --- |
| Imediata | 5.044 ms |
| Abertura atrasada em 2.000 ms | 5.029 ms |

As duas execuções exibiram uma única ausência. O segundo ensaio também verificou o reinício enquanto o vídeo continuava sem pessoa. Os avisos de inicialização de WebGL/XNNPACK do MediaPipe não foram tratados como falhas de envio.

Os fixtures de conta e gravação dessa medição ficam isolados do banco pessoal. A câmera física não foi acessada. Os testes React substituem as entradas de visão e IPC; os testes Rust usam a migration real com SQLite em memória. A execução no dispositivo físico continua sendo necessária para avaliar latência específica do driver, da câmera e da carga da máquina.

## Como executar

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Arquivos mais diretamente relacionados: `src/pages/Monitoring.history.integration.test.tsx`, `src/pages/Monitoring.test.tsx`, `src/components/monitoring/WebcamFeed.test.tsx`, `src/components/monitoring/PostureHistoryLog.test.tsx`, `src/hooks/useMetricRecording.test.tsx` e os testes SQLite em `src-tauri/src/services/session_history_service.rs`.

Os avisos de ausência não dependem do resumo de métricas, que continua sendo gravado por janelas completas de um minuto. Os alertas posturais mantêm sua confirmação temporal; essa espera de domínio é diferente do atraso de atualização da lista, removido com a notificação após gravação.
