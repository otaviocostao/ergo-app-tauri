# Estado da implementação

Esta matriz descreve o código de referência indicado no [índice](README.md). Ela não avalia mudanças presentes exclusivamente em outras branches.

| Área | Evidência no código | Situação em relação ao TCC |
| --- | --- | --- |
| Captura da câmera | [WebcamFeed](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/components/monitoring/WebcamFeed.tsx) usa `getUserMedia` e enumera câmeras. | Captura e exibição existem. Não foi encontrado processamento do vídeo para identificar pontos reais. |
| Pontos e métricas posturais | No mesmo componente, coordenadas e medidas são geradas com `Math.sin`, `Math.cos`, dimensões do canvas e tempo. | Simulação, inclusive quando o vídeo real está disponível. RF-01 e RF-02 ainda não estão atendidos como detecção real. |
| EAR e piscadas | Não encontrados no frontend, comandos ou serviços inspecionados. | RF-03 pendente. Não confundir o ícone de olho/distância com monitoramento ocular. |
| Configuração do ambiente | [Configurações](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/pages/Settings.tsx), [modal](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/components/monitoring/WorkspaceCalibrationModal.tsx), [workspace service](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/workspace_service.rs). | Persistência local implementada. |
| Base postural | O modal exibe pescoço e ombros recebidos por props, mas envia apenas configuração do ambiente. [Model](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/models/workspace.rs) não possui campos angulares. | Calibração de uma referência medida e sua persistência ainda não implementadas. |
| Estado e alertas posturais | Status visuais em WebcamFeed; controle `soundAlerts` em [Monitoramento](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/pages/Monitoring.tsx). | Não foi encontrado motor de alertas persistentes nem execução sonora ligada ao controle. RF-04 pendente como fluxo completo. |
| Lembretes | [Página](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/pages/Reminders.tsx), [serviço](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/reminder_service.rs) e tabela `reminders`. | Cadastro, edição e persistência existem. Agendamento e entrega de notificações não foram encontrados neste recorte. |
| Histórico | Estado React em Monitoramento; linha temporal fixa em [PostureHistoryLog](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/components/monitoring/PostureHistoryLog.tsx). | Dados iniciais demonstrativos e eventos em memória. Não foi encontrada persistência de eventos posturais. |
| Dashboard | [Home](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/pages/Home.tsx) contém apenas um contêiner vazio neste recorte. | RF-05 pendente nesta branch. A implementação de outra branch não foi auditada aqui. |
| Digitação | [KeyboardMonitorCard](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src/components/monitoring/KeyboardMonitorCard.tsx) conta eventos `keydown` da janela do app. | Existe no software; excluída do escopo declarado no TCC. Não mede atividade global de outros aplicativos. |
| Contas e perfil | [Auth](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/auth_service.rs), [usuários](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/services/user_service.rs), Configurações e rotas. | Funcionalidade existente, sem requisitos detalhados correspondentes no resumo. |
| Dados persistidos | [Schema inicial](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/migrations/0001_initial_migration.sql): `users`, `reminders`, `companies` e `workspaces`. | Estrutura local existente; não há tabelas de medições, sessões posturais ou base angular. |

## Fluxo atual de persistência do ambiente

1. Modal ou Configurações consulta `workspaceService.getAll()`.
2. O serviço frontend invoca `get_workspaces` no Tauri.
3. O [comando](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/commands/workspace.rs) obtém a conexão do estado e chama o serviço Rust.
4. O [repositório](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/src-tauri/src/repositories/workspace_repository.rs) consulta a tabela `workspaces`.
5. O formulário reutiliza o primeiro registro ou cria um na primeira gravação.

Atualizar essas respostas altera os dados do ambiente. Isso não define uma referência anatômica nem modifica os cálculos simulados do monitoramento.

## Limitações de dados e acesso

Workspace e lembrete não possuem identificação de proprietário no schema atual. Os comandos de workspace não verificam a sessão. A proteção das rotas no frontend não estabelece, por si, autorização sobre registros no backend. A política pretendida precisa ser decidida antes de alegar isolamento por usuário ou empresa.

Não foi encontrado envio de frames no fluxo de câmera inspecionado. Isso não comprova o ciclo de descarte de um futuro módulo de visão nem conformidade integral de todos os fluxos de dados.

## Documentação preexistente a reconciliar

O [README principal](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/README.md) ainda contém referências a `src-tauri/src/auth.rs`, ao schema antigo de usuários e à ausência de persistência dos lembretes. O código atual usa serviços de autenticação e já possui CRUD de lembretes e workspaces.

O README recomenda novas migrações, enquanto a [skill de backend versionada](https://github.com/otaviocostao/ergo-app-tauri/blob/45d248839f61df2fae1ca78599a1511efb9ef1d1/skills/backend-model-development/SKILL.md) estabelece uma única migração inicial e exige solicitação explícita para criar outras. Essa divergência precisa de decisão e atualização documental; esta revisão não altera banco ou migrações.
