# Relatórios com dados reais

As abas de `/reports` consultam o SQLite da conta autenticada por `get_report_data`. Não há fonte demonstrativa nem preenchimento de resultados quando a consulta falha ou retorna vazia. O schema existente já fornece os dados necessários; esta integração não cria tabelas nem migrations.

## Revisão dos indicadores

| Indicador anterior | Apresentação atual | Base disponível |
| --- | --- | --- |
| Índice ergonômico como percentual de tempo | Score postural médio, de 0 a 100 | `score` e `samples_count` dos resumos posturais válidos |
| Minutos em boa postura e fora da faixa | Proporção e contagem de resumos adequados, em atenção e em risco | `dominant_status` de cada resumo; não existe distribuição temporal de todos os frames por minuto |
| Meta fixa de 6 horas | Removida dos relatórios | O relatório não dispõe de duração exata em boa postura para medir seu cumprimento |
| Pausas feitas | Removidas dos relatórios | Não há registro de pausa ergonômica confirmada; ausência da câmera não comprova uma pausa |
| Alertas de tronco simulados | Tipos efetivamente gravados | Pescoço, ombros, distância e baixa frequência de piscadas; outros tipos salvos são agrupados em Outros alertas |
| Alertas por hora de postura válida | Contagem de episódios e de episódios encerrados | A duração da sessão é compartilhada com digitação; o tempo de postura válida não é persistido com a granularidade necessária para esse denominador |
| Histórico em horários comerciais fixos | Agrupamento pelo horário local do registro | Os 24 horários do dia são considerados |
| Sem seção de digitação | Aba Digitação | Resumos de cadência e atividade de teclado já persistidos |

## Cálculos

- **Score médio:** soma de `score × samples_count`, dividida pela soma de `samples_count`. São aceitos resumos com amostras positivas e classificação `good`, `warning` ou `danger`. `absent`, `unavailable` e resumos sem amostras ficam fora do cálculo.
- **Resumos adequados:** quantidade de resumos válidos com classificação predominante `good` dividida pela quantidade de resumos válidos. Cada resumo tem um voto. Esse percentual descreve resumos, sem estimar uma duração exata em boa postura. A classificação pode considerar também o módulo ocular, enquanto o score usa as medidas de pescoço, ombros e distância disponíveis.
- **Médias anatômicas:** média das médias salvas nos resumos que possuem a medida. Não há contagem de amostras por campo anatômico para calcular uma média global exata dos frames. `null` permanece indisponível; zero medido é preservado. Os extremos usam os máximos e mínimos salvos. O alinhamento dos ombros é o indicador de 0 a 100 já usado pelo monitoramento.
- **Piscadas registradas:** soma dos contadores salvos em resumos válidos. Quando não há evidência de medição ocular, o card permanece indisponível. Não se deduz uma taxa de piscadas a partir de contadores sem duração ocular válida.
- **Duração de sessão:** usa somente `duration_seconds` de sessões encerradas. Sessões que atravessam limites de dia ou período distribuem essa duração proporcionalmente à interseção do intervalo entre início e fim. Sessões abertas são identificadas e ficam fora do total, embora seus resumos já salvos sejam exibidos. Uma sessão antiga sem encerramento não é projetada como atividade em dias posteriores sem registros.
- **Alertas:** cada registro de episódio conta uma vez, pelo horário de início gravado em `timestamp`. Gravidade e duração vêm do registro. A duração exibida pertence ao episódio inteiro. Episódios podem ocorrer simultaneamente, por isso suas durações não são somadas como tempo único de postura inadequada.
- **Digitação:** teclas, segundos ativos e micropausas são somados. A cadência média pondera `cadence_cpm` pela duração real de cada janela, incluindo janelas parciais. Pico e maior sequência contínua usam os máximos gravados. O contador de continuidade pode começar antes do período selecionado. Micropausas de teclado não são contadas como pausas ergonômicas confirmadas.

Resumos posturais e de digitação pertencem ao horário de registro salvo, que corresponde ao fechamento da respectiva janela. A filtragem e os gráficos usam esse horário, sem inventar a distribuição de eventos individuais dentro de uma janela que cruza uma fronteira.

## Consulta e atualização

O backend recebe somente início e fim em RFC 3339. O proprietário vem de `AuthState`; campos extras como `userId` são rejeitados. A consulta filtra todas as coleções pela conta, usa início inclusivo e fim exclusivo e inclui sessões iniciadas antes do período quando elas o atravessam. As coleções são lidas separadamente na mesma transação para evitar duplicação de totais por joins.

Datas de calendário são interpretadas no fuso local do computador. Timestamps SQLite sem offset são interpretados como UTC, conforme o padrão de gravação do banco. Dias sem dados permanecem sem pontuação. O período atual exclui registros futuros e compara o mesmo trecho decorrido do período anterior, com corte no horário local atual e limite no fim de meses mais curtos.

O frontend aguarda escritas pendentes de sessão, recarrega após eventos de gravação da mesma conta, ao retornar à janela e a cada 30 segundos em primeiro plano. Respostas anteriores de outra conta ou de outro filtro são descartadas. Uma gravação durante uma leitura invalida a resposta em andamento e solicita nova consulta. Falhas não são tratadas como resultados vazios bem-sucedidos.
