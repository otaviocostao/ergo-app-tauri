---
name: backend-model-development
description: >-
  Guia de padrões arquiteturais, convenções de código em inglês, nomenclatura e
  fluxo passo a passo para implementação de novas entidades/models no backend Rust (Tauri)
  seguindo a arquitetura em camadas (Model -> Repository -> Service -> Command/Controller).
---

# Padrão de Arquitetura e Desenvolvimento Backend (Rust / Tauri)

Este documento estabelece a arquitetura padrão, convenções de código, padrões de nomenclatura e o checklist passo a passo para a criação e manutenção de models e CRUDs no backend Rust deste projeto.

---

## 1. Visão Geral da Arquitetura em Camadas

O backend segue estritamente a **Arquitetura em Camadas** (*Layered Architecture*), respeitando a separação de responsabilidades e o Princípio da Responsabilidade Única (SRP).

```
Frontend (TypeScript / Tauri invoke)
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│ 1. Commands / Controllers (`src-tauri/src/commands/`)    │
│    - Camada de transporte IPC                            │
│    - Thin controllers (apenas recebem IPC e chamam Service)│
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ 2. Services (`src-tauri/src/services/`)                  │
│    - Regras de negócio, validações de domínio            │
│    - Geração de UUIDs, timestamps (Utc::now)             │
│    - Orquestração e testes unitários de lógica           │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Repositories (`src-tauri/src/repositories/`)          │
│    - Acesso a dados puro (rusqlite / SQLite)             │
│    - Mapeamento de linhas (map_*_row)                    │
│    - Execução de queries (SELECT, INSERT, UPDATE, DELETE)│
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ 4. Models (`src-tauri/src/models/`)                      │
│    - Structs de domínio, Enums e DTOs (Payloads)         │
│    - Serialização/Desserialização (serde)                │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Estrutura de Diretórios

Todo o código de backend reside em `src-tauri/src/`:

```text
src-tauri/src/
├── models/
│   ├── mod.rs
│   └── <entity>.rs              # Structs, DTOs e Enums da entidade
├── repositories/
│   ├── mod.rs
│   └── <entity>_repository.rs   # Queries SQL e persistência da entidade
├── services/
│   ├── mod.rs
│   └── <entity>_service.rs      # Regras de negócio, validações e testes
├── commands/
│   ├── mod.rs
│   └── <entity>.rs              # Tauri IPC commands (thin controllers)
├── db.rs                        # Conexão SQLite, migrações e seeds
├── lib.rs                       # Declaração de módulos e registro de invoke_handlers
└── main.rs                      # Ponto de entrada da aplicação
```

---

## 3. Padronização de Código em Inglês

Todo o código Rust (e interfaces TypeScript) deve ser escrito **100% em Inglês**:
- **Nomes de arquivos e pastas**: em inglês (`reminder.rs`, `reminder_repository.rs`).
- **Nomes de variáveis, structs, enums e funções**: em inglês (`start_time`, `find_by_id`).
- **Mensagens de erro e logs**: em inglês (`"Reminder with id '{}' not found"`).
- **Comentários de código**: em inglês (`// Validate reminder time range`).

> **Exceção**: Textos literais voltados ao usuário final na interface gráfica (dados pré-populados no banco/seed em português como `"Ajuste de Postura"` ou rótulos de UI). O código, identificadores e status técnicos de sistema (`"ativo"`, `"inativo"` se já definidos no schema do banco) devem respeitar a consistência existente.

---

## 4. Convenções de Nomenclatura (Naming Conventions)

### 4.1 Rust

| Elemento | Convenção | Exemplo |
| :--- | :--- | :--- |
| **Arquivos** | `snake_case` | `reminder_repository.rs`, `reminder_service.rs` |
| **Structs & Enums** | `PascalCase` | `Reminder`, `CreateReminderPayload`, `ReminderFrequency` |
| **Campos de Structs** | `snake_case` | `start_time`, `notification_tone`, `custom_days` |
| **Variáveis & Parâmetros**| `snake_case` | `conn`, `reminder_id`, `updated_at` |
| **Constantes** | `SCREAMING_SNAKE_CASE` | `SELECT_REMINDER_FIELDS` |
| **Funções de Comandos (IPC)** | `snake_case` | `get_reminders`, `create_reminder`, `delete_reminder` |

### 4.2 Métodos por Camada

- **Repository Layer** (`<entity>_repository.rs`):
  - `find_all(conn: &Connection) -> Result<Vec<T>, rusqlite::Error>`
  - `find_by_id(conn: &Connection, id: &str) -> Result<Option<T>, rusqlite::Error>`
  - `insert(conn: &Connection, entity: &T) -> Result<(), rusqlite::Error>`
  - `update(conn: &Connection, entity: &T) -> Result<usize, rusqlite::Error>`
  - `delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error>`
  - `update_status(conn: &Connection, id: &str, ...) -> Result<usize, rusqlite::Error>`

- **Service Layer** (`<entity>_service.rs`):
  - `get_<entities>(conn: &Connection) -> Result<Vec<T>, String>`
  - `get_<entity>_by_id(conn: &Connection, id: &str) -> Result<T, String>`
  - `create_<entity>(conn: &Connection, payload: Create<Entity>Payload) -> Result<T, String>`
  - `update_<entity>(conn: &Connection, payload: Update<Entity>Payload) -> Result<T, String>`
  - `delete_<entity>(conn: &Connection, id: &str) -> Result<bool, String>`
  - `toggle_<entity>_status(conn: &Connection, id: &str) -> Result<T, String>`
  - Funções de validação: `validate_<rule>(...) -> Result<(), String>`

- **Command Layer** (`commands/<entity>.rs`):
  - Mantém o mesmo nome dos métodos de Service: `get_<entities>`, `create_<entity>`, etc.
  - Recebe `state: State<'_, AppState>`, obtém `state.db.lock()` e delega ao Service.

### 4.3 Integração Frontend / IPC (Serde)

Para manter compatibilidade perfeita entre o camelCase do JavaScript/TypeScript e o snake_case do Rust:
- Em **Structs de Models e Payloads**, adicione sempre:
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct MyEntity {
      pub id: String,
      pub created_at: Option<String>,
  }
  ```
- Em **Enums**, use a convenção acordada (ex: `SCREAMING_SNAKE_CASE`):
  ```rust
  #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
  #[serde(rename_all = "SCREAMING_SNAKE_CASE")]
  pub enum EntityType {
      Default,
      Custom,
  }
  ```

---

## 5. Checklist Passo a Passo para Criar uma Nova Model

Quando for criar uma nova entidade (ex: `Notification`, `Tag`, `Profile`):

### Passo 1: Banco de Dados (`src-tauri/src/db.rs`)
1. Adicionar o script `CREATE TABLE IF NOT EXISTS <table_name> (...)` em `init_database`.
2. Se necessário, adicionar dados iniciais na função de seed.

### Passo 2: Camada de Model (`src-tauri/src/models/<entity>.rs`)
1. Criar a struct principal `<Entity>` com `#[serde(rename_all = "camelCase")]`.
2. Criar os DTOs de entrada: `Create<Entity>Payload` e `Update<Entity>Payload`.
3. Registrar o novo módulo em `src-tauri/src/models/mod.rs`:
   ```rust
   pub mod <entity>;
   ```

### Passo 3: Camada de Repositório (`src-tauri/src/repositories/<entity>_repository.rs`)
1. Declarar a constante `SELECT_<ENTITY>_FIELDS`.
2. Implementar a função `map_<entity>_row(row: &rusqlite::Row<'_>) -> Result<<Entity>, rusqlite::Error>`.
3. Implementar as funções de banco: `find_all`, `find_by_id`, `insert`, `update`, `delete`.
4. Registrar o novo módulo em `src-tauri/src/repositories/mod.rs`:
   ```rust
   pub mod <entity>_repository;
   ```

### Passo 4: Camada de Serviço (`src-tauri/src/services/<entity>_service.rs`)
1. Implementar as validações de regras de negócio de domínio.
2. Implementar as funções de negócio (`get_*`, `create_*`, `update_*`, `delete_*`), gerando `Uuid::new_v4()` e `Utc::now().to_rfc3339()`.
3. Adicionar testes unitários no módulo `#[cfg(test)] mod tests` para validar o CRUD e as regras com SQLite in-memory (`Connection::open_in_memory()`).
4. Registrar o novo módulo em `src-tauri/src/services/mod.rs`:
   ```rust
   pub mod <entity>_service;
   ```

### Passo 5: Camada de Comandos / Controller (`src-tauri/src/commands/<entity>.rs`)
1. Criar os endpoints Tauri com `#[tauri::command]`.
2. Manter as funções enxutas: apenas abrir o lock `state.db.lock()` e chamar `<entity>_service::<fn>(&conn, ...)`.
3. Registrar o novo módulo em `src-tauri/src/commands/mod.rs`:
   ```rust
   pub mod <entity>;
   ```

### Passo 6: Exposição no `lib.rs` (`src-tauri/src/lib.rs`)
1. Certificar-se de que os módulos `pub mod repositories;` e `pub mod services;` estão expostos.
2. Adicionar os novos comandos ao macro `invoke_handler`:
   ```rust
   .invoke_handler(tauri::generate_handler![
       greet,
       // Lembretes
       commands::reminder::get_reminders,
       ...
       // Nova entidade
       commands::<entity>::get_<entities>,
       commands::<entity>::create_<entity>,
   ])
   ```

### Passo 7: Frontend Service (`src/services/<entity>Service.ts`)
1. Criar as interfaces TypeScript correspondentes (`<Entity>Item`, `Create<Entity>DTO`, etc.).
2. Exportar o serviço invocando os comandos:
   ```typescript
   import { invoke } from "@tauri-apps/api/core";

   export const <entity>Service = {
     getAll: async () => await invoke<<Entity>Item[]>("get_<entities>"),
     getById: async (id: string) => await invoke<<Entity>Item>("get_<entity>_by_id", { id }),
     create: async (payload: Create<Entity>DTO) => await invoke<<Entity>Item>("create_<entity>", { payload }),
     update: async (payload: Update<Entity>DTO) => await invoke<<Entity>Item>("update_<entity>", { payload }),
     delete: async (id: string) => await invoke<boolean>("delete_<entity>", { id }),
   };
   ```

---

## 6. Verificação e Testes

Antes de finalizar qualquer implementação:
1. Executar os testes unitários do Rust:
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
2. Executar a checagem de tipos e build do frontend:
   ```bash
   npm run build
   ```
