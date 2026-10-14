# Regras de negócio

As regras abaixo separam o que está definido no TCC, o que está implementado no software e o que ainda é proposta. A aprovação de uma regra do produto, sua fundamentação científica e sua verificação técnica são registros distintos.

## Regras definidas no TCC

| ID | Regra | Origem e situação |
| --- | --- | --- |
| RN-01 | As saídas do protótipo representam indicadores e orientações; não devem ser apresentadas como diagnóstico, previsão individual de doença ou comprovação de prevenção. | Definida em Justificativa e Doenças Ocupacionais Relacionadas ao Uso de Computadores. Textos e indicadores da interface ainda precisam ser revisados. |
| RN-02 | Alertas não substituem avaliação ergonômica profissional nem comprovam conformidade integral à NR-17. | Definida em O Impacto do Trabalho Digital e a Ergonomia Ocupacional. |
| RN-03 | O escopo de detecção do protótipo cobre postura e padrões oculares obtidos por visão computacional; cadência de digitação está excluída dos objetivos. | Definida na mesma seção. O código possui um módulo de digitação; resolver divergência P-01. |
| RN-04 | Ângulos devem ser obtidos a partir das coordenadas de pontos corporais identificados. | Definida em Visão Computacional como Solução para Monitoramento Contínuo. Landmarks, plano de análise, fórmula e referência ainda não foram especificados. |
| RN-05 | EAR e padrões de piscadas podem compor regras de orientação visual; EAR isolado não identifica iminência de fadiga. | Definida na mesma seção. Módulo ocular pendente; fonte complementar em Escopo e fontes. |
| RN-06 | Os alertas devem usar regras computacionais e parâmetros de referência definidos antes da avaliação técnica. | Definida em Objetivos Específicos e Fases de Desenvolvimento. Valores finais e condições de disparo pendentes. |
| RN-07 | A arquitetura deve priorizar processamento local, conservar as métricas necessárias e descartar as imagens após o processamento. | Diretriz definida em Visão Computacional como Solução para Monitoramento Contínuo. Política completa de dados pendente. |
| RN-08 | A avaliação do protótipo deve verificar cálculos, alertas e desempenho em cenários controlados com dados de referência. | Definida em Objetivos Específicos e Metodologia. Protocolo quantitativo pendente. |

## Comportamentos implementados

Estes registros descrevem o produto existente. Não são apresentados como novos requisitos do TCC ou como critérios científicos aprovados.

### RN-09 Configuração compartilhada entre calibração e configurações

- Origem: [modal de calibração](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/components/monitoring/WorkspaceCalibrationModal.tsx), [Configurações](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/pages/Settings.tsx) e [serviço frontend](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/services/workspaceService.ts).
- As duas telas consultam `get_workspaces` e usam o primeiro resultado, ordenado no backend por criação mais recente e, em caso de empate, ID decrescente.
- A conclusão do modal cria um workspace se não houver registro carregado; caso contrário, atualiza seu ID. O modal informa erro e permanece aberto se a gravação falhar.
- Campos persistidos: `deviceType`, `isWebcamFront`, `hasExternalKeyboard`, `hasExternalMouse`, `adjustableDesk`, `adjustableChair` e `adjustableMonitor`.
- O banco também guarda ID e timestamps. Não há vínculo do workspace com usuário ou empresa nem campos para uma referência angular.
- Situação: implementada. A escolha do workspace ativo e a propriedade dos dados permanecem em P-04.

### RN-10 Valores padrão do ambiente

- Origem: [serviço Rust](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/workspace_service.rs) e formulários.
- Na criação sem parâmetros, o backend assume desktop; webcam frontal, teclado externo, mouse externo, cadeira regulável e monitor regulável como verdadeiros; mesa regulável como falsa.
- Os formulários começam com notebook quando não há workspace. Ao selecionar desktop, teclado e mouse externos são marcados como verdadeiros.
- Situação: implementada com padrões diferentes entre backend e interface. A regra definitiva depende de P-12.

### RN-11 Validações de lembretes

- Origem: [serviço de lembretes](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/reminder_service.rs).
- Intervalo deve ser positivo. Quando início e fim são enviados juntos, ambos precisam representar horários válidos, o fim deve ser posterior ao início e o intervalo deve ser menor que a duração do período.
- Frequência `ONCE` exige data não vazia; `CUSTOM` exige ao menos um dia. O serviço preserva data apenas para `ONCE` e dias apenas para `CUSTOM`.
- Situação: implementada para cadastro e edição. Isso não demonstra a existência de um agendador ou entrega de notificações. A validação atual também não comprova validade de calendário de toda data recebida ou validade de cada dia personalizado.

### RN-12 Contas locais e sessão

- Origem: [serviço de autenticação](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/auth_service.rs), [serviço de usuários](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/user_service.rs) e [rotas](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/routes/AppRoutes.tsx).
- Contas locais são persistidas; a sessão permanece na memória do processo Rust. Visitante pode acessar as rotas internas.
- Senhas são armazenadas com Argon2id. O limitador aceita até cinco tentativas na janela de 30 segundos; login bem-sucedido reinicia a contagem.
- Usuário com `externalId` preenchido não pode editar seus dados pelo serviço local. Essa restrição de origem não equivale à autorização do usuário autenticado sobre cada registro.
- Situação: implementada. Política de acesso por usuário, visitante e empresa pendente em P-08.

## Propostas pendentes de aprovação

| ID | Proposta | Motivação e decisão necessária |
| --- | --- | --- |
| PR-01 | Medidas obtidas com pontos ausentes, baixa confiança ou calibração inválida devem ser classificadas como indisponíveis, sem gerar conclusão postural a partir desse quadro. | Derivada das limitações de câmera descritas no TCC. Definir confiança mínima, qualidade e recuperação em P-03 e P-11. |
| PR-02 | Disparos de alerta devem considerar duração do desvio, repetição e intervalo entre alertas. | Evitar tratar um quadro isolado como evento persistente. Definir política temporal em P-02; não há duração aprovada. |
| PR-03 | O modo demonstrativo deve ser identificado; suas métricas não devem ser apresentadas como resultados de detecção real ou evidência experimental. | O código atual produz métricas simuladas. Definir apresentação em P-07. |
| PR-04 | Um lembrete 20-20-20 pode usar a orientação da AOA, com regras explícitas de início, pausa, retomada e confirmação. | Fundamentação consultada em Escopo e fontes. Política de temporização e inclusão no produto pendentes em P-05. |
| PR-05 | Uma base postural deve ser tratada como dado distinto da configuração do ambiente, com critérios explícitos de criação e invalidação. | O workspace atual não armazena ângulos. Definir significado, persistência e validade da base em P-03 antes de mudar o schema. |

## Parâmetros que não constituem regras validadas

Em [WebcamFeed](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/components/monitoring/WebcamFeed.tsx), o status demonstrativo fica em perigo quando pescoço > 22°, ombros < 88% ou distância < 45 cm; caso contrário, entra em atenção se pescoço > 15° ou ombros < 92%.

Esses números operam sobre medidas simuladas. O resumo do TCC não os define. O percentual dos ombros também depende de uma conversão demonstrativa de deslocamento em pixels, sem escala biomecânica especificada. Não atribuir validade científica a esses valores ou à fórmula do `healthScore` apenas porque existem no código.

Também existem limiares diferentes nos cartões de [Monitoramento](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/pages/Monitoring.tsx), incluindo ombros e distância. A padronização depende primeiro da definição da métrica e de seus parâmetros em P-02, e depois de uma implementação compartilhada.
