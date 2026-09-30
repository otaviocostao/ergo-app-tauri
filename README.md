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
O backend abre o banco e aplica as migrações SQLx de `src-tauri/migrations/` na inicialização. A primeira migração cria `users` (`id`, `full_name`, `email`, `password_hash`, `created_at`). A tabela `_sqlx_migrations` registra as versões aplicadas.

Para adicionar novas tabelas ou alterar tabelas existentes:
1. Crie um novo arquivo SQL numerado, por exemplo `src-tauri/migrations/0002_add_user_preferences.sql`.
2. Não altere migrações já aplicadas: o SQLx verifica seus checksums.
3. Reinicie o app (`npm run tauri dev`). As migrações são embutidas no executável durante a compilação, portanto também funcionam no app instalado.

### 🛠️ Como Utilizar o Banco no Frontend (TypeScript)
Para autenticação, use `src/auth/authService.ts`, que chama os comandos `register_local`, `login_local`, `get_session`, `continue_offline` e `logout`. O `AuthProvider` mantém os dados públicos da sessão e as rotas internas exigem uma sessão autenticada ou de visitante.

As permissões de SQL genérico foram removidas de `src-tauri/capabilities/default.json` para impedir leitura/alteração da tabela de credenciais pelo WebView. O helper antigo `src/db.ts` não é usado nesse fluxo. Novas operações de dados devem ser implementadas como comandos Rust específicos, validando a sessão no backend quando precisarem de autenticação.

Os lembretes e métricas existentes continuam sendo os dados demonstrativos do projeto; esta entrega persiste apenas as contas locais, não implementa ainda dados de ergonomia por usuário.

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
