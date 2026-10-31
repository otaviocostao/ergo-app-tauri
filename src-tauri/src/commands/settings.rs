use tauri::State;

use crate::db::AppState;
use crate::models::settings::{SetModuleEnabledPayload, Settings, UpdateSettingsPayload};
use crate::services::auth_service::AuthState;
use crate::services::settings_service;

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
    payload: UpdateSettingsPayload,
) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    settings_service::update_settings(&conn, &auth_state, payload)
}

#[tauri::command]
pub fn delete_settings(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    settings_service::delete_settings(&conn, &auth_state)
}

#[tauri::command]
pub fn set_module_enabled(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    payload: SetModuleEnabledPayload,
) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    settings_service::set_module_enabled(&conn, &auth_state, payload)
}
