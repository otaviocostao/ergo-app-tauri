use rusqlite::Connection;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn run_migrations(db_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let result = tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(db_path)
                    .create_if_missing(true),
            )
            .await
            .map_err(|error| error.to_string())?;

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|error| error.to_string())?;
        pool.close().await;
        Ok::<(), String>(())
    });

    result.map_err(|error| std::io::Error::other(error).into())
}

pub fn init_database(
    app_handle: &tauri::AppHandle,
) -> Result<AppState, Box<dyn std::error::Error>> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("ergo.db");

    run_migrations(&db_path)?;

    let conn = Connection::open(&db_path)?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;",
    )?;

    Ok(AppState {
        db: Mutex::new(conn),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn open_test_database(path: &Path) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn
    }

    fn insert_test_user(conn: &Connection) -> i64 {
        conn.execute(
            "INSERT INTO users (first_name, last_name, birth_date, password_hash, email, phone)
             VALUES ('Test', 'User', '1995-05-20', 'test-hash', 'test@example.com', '75999999999')",
            [],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn snapshot_reminders(conn: &Connection) -> serde_json::Value {
        use crate::repositories::reminder_repository::{map_reminder_row, SELECT_REMINDER_FIELDS};
        let query = format!(
            "SELECT {} FROM reminders ORDER BY id",
            SELECT_REMINDER_FIELDS
        );
        let mut stmt = conn.prepare(&query).unwrap();
        let reminders = stmt
            .query_map([], map_reminder_row)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        serde_json::to_value(reminders).unwrap()
    }

    #[test]
    fn fresh_database_enforces_reminder_user_relationship() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("ergo.db");
        run_migrations(&db_path).unwrap();
        let conn = open_test_database(&db_path);
        let user_id = insert_test_user(&conn);
        let reminder_id = "test-reminder-id";

        conn.execute(
            "INSERT INTO reminders (id, user_id, title, message, category, interval, period, frequency)
             VALUES (?1, ?2, 'Test', 'Msg', 'Postura', 30, '08:00 - 18:00', 'DAILY')",
            params![reminder_id, user_id],
        )
        .unwrap();
        let owner: i64 = conn
            .query_row(
                "SELECT user_id FROM reminders WHERE id = ?1",
                params![reminder_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(owner, user_id);

        let invalid_owner = conn
            .execute(
                "UPDATE reminders SET user_id = ?1 WHERE id = ?2",
                params![user_id + 1, reminder_id],
            )
            .unwrap_err();
        assert!(matches!(
            invalid_owner,
            rusqlite::Error::SqliteFailure(code, _)
                if code.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY
        ));

        let delete_owner = conn
            .execute("DELETE FROM users WHERE id = ?1", params![user_id])
            .unwrap_err();
        assert!(matches!(
            delete_owner,
            rusqlite::Error::SqliteFailure(code, _)
                if code.code == rusqlite::ErrorCode::ConstraintViolation
        ));

        let index_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_index_info('idx_reminders_user_id')
                 WHERE name = 'user_id')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(index_exists);
    }

    #[test]
    fn initial_migration_can_run_again_without_changing_data() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("ergo.db");
        run_migrations(&db_path).unwrap();

        let conn = open_test_database(&db_path);
        let user_id = insert_test_user(&conn);
        let reminder_id = "test-reminder-id";
        conn.execute(
            "INSERT INTO reminders (id, user_id, title, message, category, interval, period, frequency)
             VALUES (?1, ?2, 'Test', 'Msg', 'Postura', 30, '08:00 - 18:00', 'DAILY')",
            params![reminder_id, user_id],
        )
        .unwrap();
        let reminders_before = snapshot_reminders(&conn);
        drop(conn);

        run_migrations(&db_path).unwrap();
        run_migrations(&db_path).unwrap();

        let conn = open_test_database(&db_path);
        assert_eq!(snapshot_reminders(&conn), reminders_before);
        let stored_user_id: i64 = conn
            .query_row(
                "SELECT id FROM users WHERE email = 'test@example.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored_user_id, user_id);
        let migration_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(migration_count, 1);
    }
}
