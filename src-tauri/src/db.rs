use chrono::Utc;
use rusqlite::{params, Connection};
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

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM reminders", [], |row| row.get(0))?;

    if count == 0 {
        seed_default_reminders(&conn)?;
    }

    Ok(AppState {
        db: Mutex::new(conn),
    })
}

fn seed_default_reminders(conn: &Connection) -> Result<(), rusqlite::Error> {
    let now = Utc::now().to_rfc3339();

    let initial_reminders = [
        (
            "a59d816f-0b32-4e42-88f1-5a50e50f3b71",
            "Ajuste de Postura",
            "Mantenha a coluna reta e os pés apoiados no chão.",
            Some("Mantenha a coluna reta e os pés apoiados no chão."),
            "Postura",
            45,
            "08:00 - 18:00",
            "BUSINESS_DAYS",
            1,
            "ativo",
            Some("08:00"),
            Some("18:00"),
            None::<&str>,
            None::<&str>,
        ),
        (
            "d83c2718-4a57-4b71-9f79-247d812d3b42",
            "Beber Água",
            "Beba 250ml de água para se manter hidratado.",
            Some("Beba 250ml de água para se manter hidratado."),
            "Hidratação",
            60,
            "08:00 - 18:00",
            "DAILY",
            0,
            "ativo",
            Some("08:00"),
            Some("18:00"),
            None::<&str>,
            None::<&str>,
        ),
        (
            "e62c1145-2f91-49b0-8f92-74c718b52c83",
            "Pausa para os Olhos",
            "Olhe para um objeto distante por 20 segundos.",
            Some("Olhe para um objeto distante por 20 segundos."),
            "Pausa Visual",
            30,
            "09:00 - 17:00",
            "BUSINESS_DAYS",
            1,
            "ativo",
            Some("09:00"),
            Some("17:00"),
            None::<&str>,
            None::<&str>,
        ),
        (
            "f71e9834-8c65-4e31-92b8-93d627c14a94",
            "Alongamento dos Punhos",
            "Realize exercícios leves de rotação nos punhos.",
            Some("Realize exercícios leves de rotação nos punhos."),
            "Exercício",
            120,
            "08:00 - 18:00",
            "BUSINESS_DAYS",
            0,
            "inativo",
            Some("08:00"),
            Some("18:00"),
            None::<&str>,
            None::<&str>,
        ),
    ];

    for r in initial_reminders.iter() {
        conn.execute(
            "INSERT INTO reminders (
                id, title, message, description, category, interval, period,
                frequency, notification_tone, status, start_time, end_time, reminder_date, custom_days, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                r.0, r.1, r.2, r.3, r.4, r.5, r.6, r.7, r.8, r.9, r.10, r.11, r.12, r.13, now, now
            ],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn fresh_database_enforces_reminder_user_relationship() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("ergo.db");
        run_migrations(&db_path).unwrap();
        let conn = open_test_database(&db_path);
        seed_default_reminders(&conn).unwrap();
        let user_id = insert_test_user(&conn);
        let reminder_id = "a59d816f-0b32-4e42-88f1-5a50e50f3b71";

        conn.execute(
            "UPDATE reminders SET user_id = ?1 WHERE id = ?2",
            params![user_id, reminder_id],
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
        seed_default_reminders(&conn).unwrap();
        let reminders_before = crate::repositories::reminder_repository::find_all(&conn).unwrap();
        let reminders_before = serde_json::to_value(reminders_before).unwrap();
        drop(conn);

        run_migrations(&db_path).unwrap();
        run_migrations(&db_path).unwrap();

        let conn = open_test_database(&db_path);
        let reminders_after = crate::repositories::reminder_repository::find_all(&conn).unwrap();
        assert_eq!(
            serde_json::to_value(reminders_after).unwrap(),
            reminders_before
        );
        let unassigned_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM reminders WHERE user_id IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unassigned_count, 4);
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
