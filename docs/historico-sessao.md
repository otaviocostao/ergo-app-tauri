# Histórico real da sessão de monitoramento

O card **Histórico da Sessão** consulta `monitoring_sessions`, `posture_metrics_snapshots` e `posture_alerts`. Não usa mais horários, cores ou percentual de exemplo. A migration e o formato de gravação existentes foram preservados.

## Consulta e atualização

- `get_session_history` obtém o usuário da autenticação no Rust, sem aceitar um identificador de usuário enviado pela interface.
- O repositório seleciona a sessão mais recente dessa conta. Não há fallback para sessões sem proprietário ou de outras contas.
- Durante a sessão aberta, o intervalo acompanha os últimos 15 minutos. Para uma sessão encerrada, termina no horário de encerramento, permitindo rever seus últimos registros ao reabrir o app.
- A interface consulta imediatamente após salvar um alerta, sua resolução, um resumo ou uma transição de sessão. O evento interno `ergo:session-history-updated` é emitido somente depois do sucesso da gravação e identifica sua conta. A consulta periódica de cinco segundos permanece como recuperação.
- O início e o encerramento aparecem com os metadados retornados pela própria gravação, sem esperar outra consulta. Ao iniciar uma sessão nova, os dados em cache da anterior não escondem seus eventos nem preenchem sua barra.
- A consulta aguarda a criação/finalização da sessão antes de ler. Leituras não se sobrepõem; gravações ocorridas durante uma consulta invalidam sua resposta antiga e solicitam uma nova leitura. Respostas antigas também são descartadas após ocultar a página, trocar de conta ou desmontar o componente.
- A consulta periódica é suspensa quando a página fica oculta. Isso não interrompe o monitoramento nem a gravação.
- Falhas de leitura exibem uma mensagem e permitem tentar novamente. Dados anteriores, quando disponíveis, permanecem visíveis com indicação de que não foram atualizados.

## Barra e percentual

São 15 blocos de um minuto. O horário do snapshot representa o fechamento do resumo e pertence ao bloco que acaba naquele horário. Cada bloco considera os resumos gravados no intervalo correspondente:

- Verde: postura predominante boa.
- Amarelo: atenção.
- Vermelho: postura crítica.
- Cinza: não há resumo válido com amostras nesse intervalo.

Se houver mais de um resumo no mesmo bloco, a postura predominante é ponderada pela quantidade de amostras de cada resumo, com preferência pela condição mais severa em caso de empate.

O percentual mostra **resumos adequados**: número de resumos cuja postura predominante é boa dividido pelo total de resumos válidos salvos na janela. Não representa uma porcentagem exata dos frames individuais nem usa os valores iniciais de 100% da sessão. Os snapshots atuais não armazenam a distribuição individual dos frames. Sem resumos válidos, o card apresenta **Sem resumos registrados**.

A gravação existente produz um resumo após um minuto completo de leituras válidas. Ausência, oclusão, pausa ou calibragem descartam janelas incompletas. Por isso, iniciar o monitoramento não preenche imediatamente a barra e intervalos sem leitura não são classificados como boa postura.

## Lista de eventos

- O início e o encerramento vêm dos horários salvos na sessão.
- Os últimos 100 alertas da sessão vêm do banco, com mensagem, gravidade, duração registrada e resolução. Notificações repetidas do cooldown não criam cópias do mesmo episódio nessa lista.
- Presença, concorrência de câmera e ações da interface continuam sendo eventos reais desta execução. Esses avisos temporários não são persistidos nas tabelas de alertas e não reaparecem ao reiniciar o app.
- “Usuário presente” aparece na primeira detecção válida após um início explícito do monitoramento. Depois disso, só aparece novamente ao retornar de uma ausência confirmada de pelo menos cinco segundos, com uma única mensagem por retorno. Oscilações de enquadramento parcial não reiniciam esse aviso.
- A ausência usa a mesma regra de cinco segundos no início e nos episódios posteriores, sem a tolerância adicional de 15 segundos. O relógio começa ao iniciar a captura, e não quando a promessa de abertura/reprodução do vídeo termina. Uma solicitação de troca/reabertura de câmera inicia um novo período de detecção.
- A duração usa `performance.now()`, evitando interferência de ajustes no relógio do sistema. Um verificador de 100 ms mantém o aviso independente do desenho dos quadros, emite apenas nas transições e é cancelado ao parar/desmontar. Sem câmera disponível, durante bloqueio ou mute, não há novo aviso de ausência; recuperar uma captura pendente não adiciona outra espera arbitrária de cinco segundos.
- Reiniciar enquanto o usuário ainda está ausente redefine o estado de detecção e permite um novo aviso após cinco segundos, sem exigir que ele retorne antes.
- A calibragem e a captura desligada não geram avisos de presença/ausência. Retomar o monitoramento após calibrar preserva o último estado anunciado; encerrar e iniciar explicitamente permite uma nova mensagem inicial.
- Concorrência de câmera é registrada na lista somente quando seu estado muda.
- Eventos temporários possuem horário completo e identificador único; são filtrados pelos limites da sessão e ordenados junto aos eventos salvos. A confirmação **Ambiente de trabalho salvo com sucesso** pertence à conta autenticada e permanece visível entre a sessão encerrada para calibrar e a nova sessão de monitoramento. Ela só é gerada após salvar, e pode ser removida pelo botão de limpar a lista.
- Falhas de gravação, preferências da câmera, concorrência de hardware e pausas de digitação pertencem à conta e não são descartadas por ocorrerem fora da sessão postural. Quando apenas a análise ocular está habilitada, presença/ausência também pertencem à conta: a inexistência de uma nova sessão postural não deve esconder esses avisos.
- **Limpar lista de eventos** oculta os itens dessa tela e preserva o banco e a barra. Alertas novos continuam aparecendo; reabrir a tela pode recuperar os eventos salvos.
- Horários RFC 3339 com fuso e datas antigas do SQLite em UTC são normalizados no backend. A tela os apresenta no horário local em formato `pt-BR`.

## Arquivos principais

- Backend: `models/session_history.rs`, `repositories/session_history_repository.rs`, `services/session_history_service.rs` e `commands/session_history.rs`, dentro de `src-tauri/src`.
- Contrato e IPC: `src/types/sessionHistory.ts` e `src/services/sessionHistoryService.ts`.
- Atualização: `src/hooks/useSessionHistory.ts`.
- Notificação após gravação: `src/services/monitoring/sessionHistoryEvents.ts` e `src/hooks/useMetricRecording.ts`.
- Apresentação: `src/components/monitoring/PostureHistoryLog.tsx`.
- Origem dos eventos temporários: `src/pages/Monitoring.tsx`.

## Validação

- A matriz e os resultados da validação de mensagens estão em [testes-mensagens-monitoramento.md](testes-mensagens-monitoramento.md).
- O build TypeScript/Vite passou, mantendo o aviso anterior de bundle acima de 500 kB.
- Ausência: testes com relógio controlado conferem os limites de 4.999 e 5.000 ms, abertura lenta, reinício sem retorno do usuário, suspensão de quadros, ajustes do relógio do sistema e mute/permissão negada.
- Testes SQLite em memória com a migration real: autenticação, isolamento entre usuários e sessões, cores, percentual, lacunas, limites da janela, fusos, horários antigos e os últimos 100 alertas com duração/resolução.
- Testes React: dados carregados, banco vazio, reabertura, polling sem sobreposição, limpeza visual, alertas novos, resposta atrasada de outra conta, falha de leitura, retry e página oculta.
- Regressões de presença: enquadramentos parciais repetidos, ausência confirmada com retorno, callbacks antes de iniciar/depois de encerrar, reinício explícito e passagem pela calibragem.
- Regressões da confirmação de calibragem: apresentação entre o encerramento da sessão e a retomada, manutenção do filtro dos outros eventos, limpeza da lista e isolamento entre contas.
- Prévia Chrome com dados de teste: card preenchido em 660 e 320 pixels de largura, além de banco vazio, sem transbordamento nem erros de console. Essa prévia não acessa o banco pessoal nem a webcam.

Para conferir no aplicativo, inicie o monitoramento com calibração e leitura válidas, aguarde um minuto completo e observe o primeiro resumo. Confira um alerta persistente, encerre a sessão e reabra o app: os alertas salvos e os blocos da sessão devem permanecer disponíveis. Ao entrar em outra conta, devem aparecer apenas seus próprios registros.
