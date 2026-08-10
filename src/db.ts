import Database from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:ergo.db";

let dbInstance: Database | null = null;

/**
 * Retorna ou inicializa a conexão com o banco de dados SQLite.
 */
export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load(DB_PATH);
  }
  return dbInstance;
}

export { Database };
