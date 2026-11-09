use rusqlite::Connection;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
}

/// Upgrade the known previous schema while retaining this project's single initial migration.
/// Only its exact checksum is accepted; unrelated migration mismatches still fail validation.
async fn upgrade_daily_goal(
    pool: &sqlx::SqlitePool,
    initial: &sqlx::migrate::Migration,
) -> Result<(), sqlx::Error> {
    let has_history: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = '_sqlx_migrations')",
    )
    .fetch_one(pool)
    .await?;
    if !has_history {
        return Ok(());
    }
    let checksum: Option<Vec<u8>> = sqlx::query_scalar(
        "SELECT checksum FROM _sqlx_migrations WHERE version = 1 AND success = 1",
    )
    .fetch_optional(pool)
    .await?;
    // Source checkouts may use either LF or CRLF line endings.
    let legacy_sql = initial.sql.replace("\r\n", "\n").replace(
        "    daily_goal_minutes INTEGER NOT NULL DEFAULT 360 CHECK (daily_goal_minutes BETWEEN 1 AND 1440),\n",
        "",
    );
    let recognized = [legacy_sql.clone(), legacy_sql.replace('\n', "\r\n")]
        .into_iter()
        .any(|sql| {
            let legacy = sqlx::migrate::Migration::new(
                initial.version,
                initial.description.clone(),
                initial.migration_type,
                sql.into(),
                initial.no_tx,
            );
            checksum.as_deref() == Some(legacy.checksum.as_ref())
        });
    if recognized {
        let mut transaction = pool.begin().await?;
        sqlx::query("ALTER TABLE settings ADD COLUMN daily_goal_minutes INTEGER NOT NULL DEFAULT 360 CHECK (daily_goal_minutes BETWEEN 1 AND 1440)")
            .execute(&mut *transaction).await?;
        sqlx::query("UPDATE _sqlx_migrations SET checksum = ?1 WHERE version = 1")
            .bind(initial.checksum.as_ref())
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
    }
    Ok(())
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

        let migrator = sqlx::migrate!("./migrations");
        upgrade_daily_goal(&pool, &migrator.migrations[0])
            .await
            .map_err(|error| error.to_string())?;
        migrator
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

    fn insert_test_user(conn: &Connection) -> String {
        let user_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
             VALUES (?1, 'Test', 'User', '1995-05-20', 'test-hash', 'test@example.com', '75999999999')",
            rusqlite::params![user_id],
        )
        .unwrap();
        user_id
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
        for (table, column) in [
            ("users", "id"),
            ("reminders", "user_id"),
            ("settings", "user_id"),
            ("posture_calibrations", "user_id"),
            ("monitoring_sessions", "user_id"),
        ] {
            let column_type: String = conn
                .query_row(
                    "SELECT type FROM pragma_table_info(?1) WHERE name = ?2",
                    params![table, column],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(column_type, "TEXT", "{table}.{column}");
        }
        let user_id = insert_test_user(&conn);
        let reminder_id = "test-reminder-id";

        conn.execute(
            "INSERT INTO reminders (id, user_id, title, message, category, interval, period, frequency)
             VALUES (?1, ?2, 'Test', 'Msg', 'Postura', 30, '08:00 - 18:00', 'DAILY')",
            params![reminder_id, user_id],
        )
        .unwrap();
        let owner: String = conn
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
                params![uuid::Uuid::new_v4().to_string(), reminder_id],
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
        let stored_user_id: String = conn
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

    #[test]
    fn fresh_database_enforces_typing_metrics_snapshots_schema_and_cascade() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("ergo.db");
        run_migrations(&db_path).unwrap();
        let conn = open_test_database(&db_path);
        let user_id = insert_test_user(&conn);

        conn.execute(
            "INSERT INTO monitoring_sessions (id, user_id, started_at)
             VALUES ('session-1', ?1, '2026-11-04T17:00:00Z')",
            params![user_id],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO typing_metrics_snapshots (
                id, session_id, timestamp, keystrokes_count, cadence_cpm, peak_cpm,
                active_typing_seconds, micro_pauses_count, continuous_typing_minutes, dominant_status
             ) VALUES (
                'snap-1', 'session-1', '2026-11-04T17:01:00Z', 180, 180.0, 240.0,
                45, 2, 1, 'good'
             )",
            [],
        )
        .unwrap();

        let invalid_status = conn
            .execute(
                "INSERT INTO typing_metrics_snapshots (id, session_id, timestamp, dominant_status)
                 VALUES ('snap-invalid-status', 'session-1', '2026-11-04T17:02:00Z', 'invalid')",
                [],
            )
            .unwrap_err();
        assert!(matches!(
            invalid_status,
            rusqlite::Error::SqliteFailure(code, _)
                if code.code == rusqlite::ErrorCode::ConstraintViolation
        ));

        let invalid_session = conn
            .execute(
                "INSERT INTO typing_metrics_snapshots (id, session_id, timestamp, dominant_status)
                 VALUES ('snap-orphan', 'non-existent-session', '2026-11-04T17:02:00Z', 'good')",
                [],
            )
            .unwrap_err();
        assert!(matches!(
            invalid_session,
            rusqlite::Error::SqliteFailure(code, _)
                if code.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY
        ));

        let session_idx_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_index_info('idx_typing_metrics_snapshots_session_id')
                 WHERE name = 'session_id')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(session_idx_exists);

        let timestamp_idx_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_index_info('idx_typing_metrics_snapshots_timestamp')
                 WHERE name = 'timestamp')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(timestamp_idx_exists);

        conn.execute("DELETE FROM monitoring_sessions WHERE id = 'session-1'", [])
            .unwrap();
        let remaining_snapshots: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM typing_metrics_snapshots WHERE session_id = 'session-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining_snapshots, 0);
    }
}
