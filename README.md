# Ergo App (Tauri + React + TypeScript)

Este projeto é uma aplicação Desktop construída com **Tauri v2**, **React** e **TypeScript**.

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** (v18+)
- **Rust & Cargo** (instalados via `rustup`)
- Dependências do sistema para o Tauri (consulte a [Documentação oficial do Tauri](https://v2.tauri.app/start/prerequisites/))

### Passos para inicializar
1. Instale as dependências Node:
   ```bash
   npm install
   ```

2. Inicie o servidor de desenvolvimento do Tauri:
   ```bash
   npm run tauri dev
   ```

---

## 🗄️ Configuração do Banco de Dados SQLite Local

O projeto utiliza o **SQLite** como banco de dados principal através do plugin oficial `@tauri-apps/plugin-sql` / `tauri-plugin-sql`.

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
As estruturas de tabelas e migrações são gerenciadas automaticamente no momento de inicialização da aplicação através do backend Rust em `src-tauri/src/lib.rs`.

Para adicionar novas tabelas ou alterar tabelas existentes:
1. Abra o arquivo `src-tauri/src/lib.rs`.
2. Adicione uma nova struct `Migration` no vetor de migrações (incrementando a `version`):
   ```rust
   Migration {
       version: 2,
       description: "add_user_preferences",
       sql: "CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT);",
       kind: MigrationKind::Up,
   }
   ```
3. Ao reiniciar o app (`npm run tauri dev`), a nova migração será executada automaticamente.

### 🛠️ Como Utilizar o Banco no Frontend (TypeScript)
Toda a comunicação com o banco no frontend React utiliza a conexão fornecida por `src/db.ts`.

Exemplo de uso:
```typescript
import { getDb } from "./db";

const db = await getDb();

// Executar consulta SELECT
const users = await db.select("SELECT * FROM users;");

// Executar comandos INSERT / UPDATE / DELETE
await db.execute("INSERT INTO users (name) VALUES ($1);", ["Nome Exemplo"]);
```

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
