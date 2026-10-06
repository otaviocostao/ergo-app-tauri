# Ergo App (Tauri + React + TypeScript)

Este projeto é uma aplicação Desktop construída com **Tauri v2**, **React** e **TypeScript**.

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
- A conta permanece no SQLite após fechar o app. A sessão fica somente na memória do processo Rust: recarregar a tela mantém a sessão, mas fechar e reabrir o app exige novo login.
- Senhas são armazenadas como hash **Argon2id**, com salt aleatório por cadastro. O hash nunca é retornado ao frontend. Após cinco tentativas de login em 30 segundos, novas tentativas aguardam o fim dessa janela.
- Não há envio de dados, confirmação de e-mail, recuperação de senha ou sincronização online nesta versão. O SQLite não é criptografado; o login não substitui as permissões de acesso aos arquivos do sistema operacional.

### Compartilhar com os colegas

Compartilhe código, `package-lock.json`, `src-tauri/Cargo.lock` e migrações pelo Git. Cada colega executa `npm ci` e `npm run tauri dev`; o app cria o banco automaticamente e cada pessoa cadastra sua conta no próprio computador. Contas e dados não são compartilhados entre máquinas. Os arquivos de banco estão no `.gitignore`.

No PowerShell, se `npm.ps1` estiver bloqueado, use `npm.cmd ci` e `npm.cmd run tauri dev`.

`npm run dev` abre apenas a prévia web: é possível conferir as telas e navegar como visitante, mas login/cadastro reais exigem o app Tauri. A prévia não simula um cadastro bem-sucedido. A interface usa a pilha de fontes do sistema e não depende do download de fontes.

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
Para autenticação, use `src/auth/authService.ts`, que chama os comandos `register_local`, `login_local`, `get_session`, `continue_offline` e `logout`. O `AuthProvider` mantém os dados públicos da sessão e as rotas internas exigem uma sessão autenticada ou de visitante.

As permissões de SQL genérico foram removidas de `src-tauri/capabilities/default.json` para impedir leitura/alteração da tabela de credenciais pelo WebView. O helper antigo `src/db.ts` não é usado nesse fluxo. Novas operações de dados devem ser implementadas como comandos Rust específicos, validando a sessão no backend quando precisarem de autenticação.

As contas e os lembretes por usuário são persistidos no SQLite local. O agendamento e o disparo de notificações ainda não estão implementados. As métricas de ergonomia continuam demonstrativas. A interface do modo visitante ainda precisa de uma mensagem específica para a indisponibilidade dos lembretes.

### Testes

```bash
npm run build
npm run test:auth
```

- `test:auth`: testes Rust com SQLite temporário, cobrindo cadastro, validações, duplicidade, hash, login, sessões, limite de tentativas e persistência.

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
