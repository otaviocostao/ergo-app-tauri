pub mod commands;
pub mod db;
pub mod models;

use tauri::Manager;
use tauri_plugin_sql::Migration;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations: Vec<Migration> = vec![];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ergo.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_state = db::init_database(app.handle())?;
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::reminder::get_reminders,
            commands::reminder::get_reminder_by_id,
            commands::reminder::create_reminder,
            commands::reminder::update_reminder,
            commands::reminder::delete_reminder,
            commands::reminder::toggle_reminder_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

