use tauri::State;

use crate::db::AppState;
use crate::models::settings::{SetModuleEnabledPayload, Settings, UpdateSettingsPayload};
use crate::services::auth_service::AuthState;
use crate::services::settings_service;
use crate::services::typing_monitor_service::TypingMonitorControl;

fn sync_typing_module_state(monitor: &TypingMonitorControl, typing_enabled: bool) {
    if typing_enabled {
        let _ = monitor.on_module_enabled();
    } else {
        let _ = monitor.on_module_disabled();
    }
}

#[tauri::command]
pub fn get_settings(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    settings_service::get_settings(&conn, &auth_state)
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    typing_monitor: State<'_, TypingMonitorControl>,
    payload: UpdateSettingsPayload,
) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let settings = settings_service::update_settings(&conn, &auth_state, payload)?;
    sync_typing_module_state(&typing_monitor, settings.typing_analysis);
    Ok(settings)
}

#[tauri::command]
pub fn delete_settings(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    typing_monitor: State<'_, TypingMonitorControl>,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let deleted = settings_service::delete_settings(&conn, &auth_state)?;
    if deleted {
        sync_typing_module_state(&typing_monitor, true);
    }
    Ok(deleted)
}

#[tauri::command]
pub fn set_module_enabled(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    typing_monitor: State<'_, TypingMonitorControl>,
    payload: SetModuleEnabledPayload,
) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    let settings = settings_service::set_module_enabled(&conn, &auth_state, payload)?;
    sync_typing_module_state(&typing_monitor, settings.typing_analysis);
    Ok(settings)
}
