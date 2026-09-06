mod auth;

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
            let directory = app.path().app_config_dir()?;
            std::fs::create_dir_all(&directory)?;
            let store =
                tauri::async_runtime::block_on(auth::AuthStore::open(&directory.join("ergo.db")))?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            auth::register_local,
            auth::login_local,
            auth::get_session,
            auth::continue_offline,
            auth::logout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
