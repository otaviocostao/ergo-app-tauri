use tauri::State;

use crate::db::AppState;
use crate::models::user_theme::{ThemePreference, UpdateUserThemePayload};
use crate::services::auth_service::AuthState;
use crate::services::user_theme_service;

#[tauri::command]
pub fn get_user_theme_preference(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
) -> Result<ThemePreference, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    user_theme_service::get_user_theme_preference(&conn, &auth_state)
}

#[tauri::command]
pub fn update_user_theme_preference(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    payload: UpdateUserThemePayload,
) -> Result<ThemePreference, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    user_theme_service::update_user_theme_preference(&conn, &auth_state, payload)
}
