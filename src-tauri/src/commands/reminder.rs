use tauri::State;

use crate::db::AppState;
use crate::models::reminder::{CreateReminderPayload, Reminder, UpdateReminderPayload};
use crate::services::auth_service::AuthState;
use crate::services::reminder_service;

#[tauri::command]
pub fn get_reminders(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
) -> Result<Vec<Reminder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::get_reminders(&conn, &auth_state)
}

#[tauri::command]
pub fn get_reminder_by_id(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    id: String,
) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::get_reminder_by_id(&conn, &auth_state, &id)
}

#[tauri::command]
pub fn create_reminder(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    payload: CreateReminderPayload,
) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::create_reminder(&conn, &auth_state, payload)
}

#[tauri::command]
pub fn update_reminder(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    payload: UpdateReminderPayload,
) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::update_reminder(&conn, &auth_state, payload)
}

#[tauri::command]
pub fn delete_reminder(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::delete_reminder(&conn, &auth_state, &id)
}

#[tauri::command]
pub fn toggle_reminder_status(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    id: String,
) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::toggle_reminder_status(&conn, &auth_state, &id)
}
