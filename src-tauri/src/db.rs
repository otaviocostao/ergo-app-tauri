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
