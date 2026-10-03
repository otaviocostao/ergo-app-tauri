pub mod commands;
pub mod db;
pub mod models;
pub mod repositories;
pub mod services;

use services::auth_service::AuthState;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_state = db::init_database(app.handle())?;
            app.manage(app_state);
            let auth_state = AuthState::new()
                .map_err(|_| std::io::Error::other("Failed to initialize authentication"))?;
            app.manage(auth_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            // Authentication
            commands::auth::register_local,
            commands::auth::login_local,
            commands::auth::get_session,
            commands::auth::continue_offline,
            commands::auth::logout,
            // Reminders
            commands::reminder::get_reminders,
            commands::reminder::get_reminder_by_id,
            commands::reminder::create_reminder,
            commands::reminder::update_reminder,
            commands::reminder::delete_reminder,
            commands::reminder::toggle_reminder_status,

            // Companies
            commands::company::get_companies,
            commands::company::get_company_by_id,
            commands::company::create_company,
            commands::company::update_company,
            commands::company::delete_company,

            // Workspace
            commands::workspace::get_workspaces,
            commands::workspace::get_workspace_by_id,
            commands::workspace::create_workspace,
            commands::workspace::update_workspace,
            commands::workspace::delete_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
