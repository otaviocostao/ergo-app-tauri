# Ergo App (Tauri + React + TypeScript)

Este projeto é uma aplicação Desktop construída com **Tauri v2**, **React** e **TypeScript**.

## Base de conhecimento

O [índice da base de conhecimento](docs/base-conhecimento/README.md) reúne o escopo do TCC, as regras de negócio, o estado da implementação e as pendências de validação. Cada registro distingue sua fonte, o comportamento encontrado no código e as decisões ainda abertas.

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** (20.19+ ou 22.12+; prefira uma versão LTS suportada)
- **Rust & Cargo** (instalados via `rustup`)
- Dependências do sistema para o Tauri (consulte a [Documentação oficial do Tauri](https://v2.tauri.app/start/prerequisites/))
- No Windows: Visual C++ Build Tools com o workload **Desenvolvimento para desktop com C++**, Windows SDK e WebView2 Runtime.

### Passos para inicializar
1. Instale as dependências Node:
   ```bash
   npm ci
   ```

2. Inicie o servidor de desenvolvimento do Tauri:
   ```bash
   npm run tauri dev
   ```

---

## Login e cadastro local

- Ao abrir o app, a tela inicial é o login (`/login`).
- **Cadastrar** abre um modal para escolher entre o cadastro on-line de empresas e o cadastro off-line. Como ainda não há backend remoto, a opção **Cadastrar online** exibe o aviso de indisponibilidade; **Cadastrar offline** abre o cadastro no próprio app (`/cadastro`).
- O cadastro local pede nome, e-mail, senha de 8 a 128 caracteres e confirmação da senha. Após o sucesso, uma animação de verificação é exibida antes do retorno ao login.
- A conta permanece no SQLite após encerrar o app. A sessão fica somente na memória do processo Rust: recarregar a tela ou ocultar a janela pelo X mantém a sessão; usar **Sair do Ergo** e abrir novamente exige novo login.
- Senhas são armazenadas como hash **Argon2id**, com salt aleatório por cadastro. O hash nunca é retornado ao frontend. Após cinco tentativas de login em 30 segundos, novas tentativas aguardam o fim dessa janela.
- Não há envio de dados, confirmação de e-mail, recuperação de senha ou sincronização online nesta versão. O SQLite não é criptografado; o login não substitui as permissões de acesso aos arquivos do sistema operacional.

### Compartilhar com os colegas

Compartilhe código, `package-lock.json`, `src-tauri/Cargo.lock` e migrações pelo Git. Cada colega executa `npm ci` e `npm run tauri dev`; o app cria o banco automaticamente e cada pessoa cadastra sua conta no próprio computador. Contas e dados não são compartilhados entre máquinas. Os arquivos de banco estão no `.gitignore`.

No PowerShell, se `npm.ps1` estiver bloqueado, use `npm.cmd ci` e `npm.cmd run tauri dev`.

`npm run dev` abre apenas a prévia web das telas de login e cadastro. Login/cadastro reais e acesso às telas internas exigem o app Tauri. A prévia não simula um cadastro bem-sucedido. A interface usa a pilha de fontes do sistema e não depende do download de fontes.

### Execução na bandeja do sistema

- No aplicativo desktop, clicar no **X** (ou usar **Alt+F4** no Windows) oculta a janela e mantém o Ergo na bandeja. O processo, a sessão e o agendador de lembretes continuam ativos.
- Clique com o botão esquerdo no ícone da bandeja para reabrir a mesma janela, restaurando-a se estiver minimizada e trazendo-a para frente. O menu do botão direito também oferece **Abrir Ergo**.
- Para encerrar completamente, escolha **Sair do Ergo** no menu da bandeja. Isso encerra o processo e interrompe o agendador. O botão de minimizar da janela mantém seu comportamento normal.
- No Windows, o ícone pode estar na área de ícones ocultos, acessível pela seta junto ao relógio. A bandeja existe no app Tauri; fechar uma aba da prévia web continua fechando essa aba.

Validação manual no Windows:

1. Execute `npm run tauri dev`, entre na conta e abra uma tela interna.
2. Clique no X: a janela deve desaparecer da barra de tarefas e o ícone do Ergo deve permanecer na bandeja.
3. Reabra pelo clique esquerdo e pelo menu **Abrir Ergo**. Confira se a tela e a sessão foram mantidas. Repita após minimizar a janela e também com Alt+F4.
4. Crie um lembrete para um horário próximo, oculte a janela pelo X e aguarde o aviso do sistema. Confira também a execução com a janela aberta.
5. Use **Sair do Ergo** e confirme que o processo e o ícone desaparecem. Abra novamente e confira que o login é solicitado. Repita a verificação na versão instalada.

## 🗄️ Configuração do Banco de Dados SQLite Local

O projeto utiliza **SQLite** local. A autenticação é gerenciada pelo backend Rust com SQLx em `src-tauri/src/auth.rs`.

### 💡 Por que SQLite?
O SQLite é um banco de dados **embarcado (embedded)**. Isso significa que:
- **Zero Instalação:** Não é necessário instalar nenhum serviço de banco de dados separado (como PostgreSQL, MySQL ou contêineres Docker) na sua máquina local.
- **Auto-Gerado:** O arquivo `.db` é criado automaticamente na primeira vez que a aplicação é executada.

### 📍 Localização do Arquivo do Banco de Dados (`ergo.db`)
Ao rodar a aplicação em modo dev ou produção, o arquivo do banco de dados `ergo.db` é gerado automaticamente no diretório de dados padrão do sistema operacional:

- **Windows:** `%APPDATA%\com.ergo.ergo-app-tauri\ergo.db`  
  *(ex: `C:\Users\<SeuUsuario>\AppData\Roaming\com.ergo.ergo-app-tauri\ergo.db`)*
- **macOS:** `~/Library/Application Support/com.ergo.ergo-app-tauri/ergo.db`
- **Linux:** `~/.config/com.ergo.ergo-app-tauri/ergo.db`

### 🔄 Migrações Automáticas
O backend abre o banco e aplica a migração SQLx de `src-tauri/migrations/` na inicialização. Nesta fase do projeto, `0001_initial_migration.sql` contém todo o schema: usuários, lembretes, empresas e ambientes de trabalho. A tabela `_sqlx_migrations` registra a versão aplicada.

Para adicionar novas tabelas ou alterar tabelas existentes:
1. Atualize `src-tauri/migrations/0001_initial_migration.sql`, mantendo o schema completo na migração inicial.
2. O SQLx verifica o checksum da migração. Quando ela for alterada nesta fase de desenvolvimento, feche o aplicativo e remova `ergo.db`, `ergo.db-wal` e `ergo.db-shm` (se existirem) do diretório de dados indicado acima. Isso apaga as contas e os dados locais; use este procedimento somente com dados descartáveis. Se for necessário preservar dados, mantenha as migrações aplicadas intactas e use novas migrações incrementais.
3. Reinicie o app (`npm run tauri dev`). As migrações são embutidas no executável durante a compilação, portanto também funcionam no app instalado.

A migração inicial inclui `reminders.user_id`, uma chave estrangeira para `users.id`, e um índice para consultas por usuário. O banco rejeita referências a usuários inexistentes e impede excluir usuários que tenham lembretes vinculados. O backend atribui o proprietário de novos lembretes pela sessão autenticada; o frontend não escolhe nem altera esse vínculo. Listar, consultar, editar, excluir e alternar o status exigem autenticação e se restringem aos lembretes do usuário conectado. Visitantes e sessões sem login não podem executar essas operações. Os exemplos sem proprietário (`user_id` nulo) ficam fora das listas das contas; não são atribuídos automaticamente a nenhum usuário.

### 🛠️ Como Utilizar o Banco no Frontend (TypeScript)
Para autenticação, use `src/auth/authService.ts`, que chama os comandos `register_local`, `login_local`, `get_session` e `logout`. O `AuthProvider` mantém os dados públicos da sessão e as rotas internas exigem uma sessão autenticada.

As permissões de SQL genérico foram removidas de `src-tauri/capabilities/default.json` para impedir leitura/alteração da tabela de credenciais pelo WebView. O helper antigo `src/db.ts` não é usado nesse fluxo. Novas operações de dados devem ser implementadas como comandos Rust específicos, validando a sessão no backend quando precisarem de autenticação.

As contas e os lembretes por usuário são persistidos no SQLite local. As rotas internas exigem uma conta autenticada. As métricas de ergonomia continuam demonstrativas.

### Disparo dos lembretes

O agendador Rust acompanha os lembretes do usuário conectado a cada segundo e funciona em qualquer tela, com a janela aberta, minimizada ou oculta na bandeja após clicar no X. Escolher **Sair do Ergo** encerra o agendador; ele não funciona como um serviço do sistema operacional.

- Para lembretes recorrentes, o primeiro aviso ocorre após um intervalo contado a partir do início. Por exemplo, de 08h às 18h com intervalo de 60 minutos, os avisos ocorrem de 09h a 17h. O horário de fim é exclusivo.
- As frequências respeitam os dias locais do computador: diariamente, segunda a sexta, sábado e domingo ou os dias personalizados.
- “Não repetir” dispara uma vez na data e no horário de início escolhidos. O intervalo e o horário de fim não se aplicam.
- Entrar na conta ou reiniciar o aplicativo agenda o próximo horário futuro. Após suspensão, avisos atrasados mais de dez segundos são ignorados; não há envio acumulado. O controle de disparos fica na memória, e horários passados não são reenviados na inicialização. Horários locais ambíguos ou inexistentes em transições de fuso são ignorados.
- Edição, desativação e exclusão atualizam o agendamento na próxima verificação. Logout e troca de conta cancelam a programação anterior.
- O aviso aparece dentro do aplicativo e também é enviado ao sistema pelo plugin de notificações do Tauri. No Windows, a opção de som usa o som padrão do sistema; lembretes silenciosos não solicitam som. Volume, modo de concentração e bloqueios de notificações do sistema podem impedir a apresentação ou o áudio. Na execução de desenvolvimento, o Windows pode identificar o aviso como PowerShell; valide também o aplicativo instalado.
- Após o plugin aceitar o envio, `reminders.last_sent_at` registra o horário efetivo em UTC (RFC 3339). Falhas reportadas pelo plugin não alteram esse campo. Esse registro não confirma a exibição ou a leitura da notificação pelo usuário. O modal de detalhes mostra o último envio no fuso local do computador, ou “Nunca enviado”, e se atualiza quando está aberto durante um disparo.
- Registrar o envio altera somente `last_sent_at`, preservando `updated_at` como referência das alterações do lembrete. Edições e mudanças de status continuam atualizando `updated_at`, inclusive a desativação automática de lembretes que não se repetem. O campo começa vazio e não recompõe envios anteriores a esta implementação.

Para conferir manualmente: entre na conta, crie um lembrete diário com início no próximo minuto, intervalo de um minuto e fim pelo menos três minutos depois. O primeiro aviso deve acontecer um minuto após o início; confira o seguinte, desative o lembrete e confirme que não há novos avisos. Repita com notificação silenciosa, outra tela aberta e a janela minimizada. Para “Não repetir”, escolha a data local de hoje e um horário futuro.

### Relatórios de postura

A opção **Relatórios** no menu abre `/reports`. Os três cartões **Ver detalhes** da tela inicial abrem as respectivas seções: índice ergonômico, boa postura e alertas. Os endereços antigos em `/dashboard/` redirecionam para essas seções.

- Filtros de dia, semana (segunda a domingo) e mês, com seleção de data e navegação entre períodos. Filtros e seção ficam na URL para preservar a navegação de voltar/avançar.
- Visão geral com evolução em pontos percentuais, tempo em boa postura, alertas por hora, pausas, meta demonstrativa de 6h e histórico diário.
- Detalhes com distribuição do tempo dentro/fora da faixa, mapa de intervalos de 10 minutos, melhores horários e registro de alertas por tipo.
- O índice é ponderado pelo tempo monitorado; dias sem leituras não recebem pontuação. Períodos em andamento comparam os dias decorridos com o mesmo trecho do período anterior (limitado ao tamanho do mês anterior).

O aviso na tela identifica o **histórico demonstrativo**, gerado em `src/data/reports.ts` para os últimos 120 dias, com leituras em dias úteis. A tela inicial usa essa mesma fonte. Ainda não há persistência de medições ou ligação entre o monitoramento ao vivo e os relatórios; a evolução exibida é ilustrativa.

### Testes

```bash
npm run build
npm run test:auth
npm run test:reports
```

- `test:auth`: testes Rust com SQLite temporário, cobrindo cadastro, validações, duplicidade, hash, login, sessões, limite de tentativas e persistência.
- `test:reports`: testes de agregação, comparação entre períodos, dias sem leituras, limites de calendário e consistência dos dados demonstrativos (Node.js 22.6+).

### 🔍 Como Inspecionar / Visualizar os Dados
Para abrir e visualizar as tabelas do banco de dados na sua máquina local durante o desenvolvimento, utilize uma destas opções:

1. **Extensão do VS Code (Recomendado):**
   - Instale a extensão **SQLite Viewer** (`qwtel.sqlite-viewer`) ou **SQLite** (`alexcvzz.vscode-sqlite`).
   - Abra o arquivo `ergo.db` localizado na pasta de dados do seu SO diretamente no VS Code.

2. **Ferramenta Desktop Externa:**
   - Baixe e instale o [DB Browser for SQLite](https://sqlitebrowser.org/).
   - Abra o arquivo `ergo.db` através do programa.

---

## 🛠️ IDE Recomendada

- [VS Code](https://code.visualstudio.com/) + [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
