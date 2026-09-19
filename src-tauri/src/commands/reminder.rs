use tauri::State;

use crate::db::AppState;
use crate::models::reminder::{
    CreateReminderPayload, Reminder, UpdateReminderPayload,
};
use crate::services::reminder_service;

#[tauri::command]
pub fn get_reminders(state: State<'_, AppState>) -> Result<Vec<Reminder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::get_reminders(&conn)
}

#[tauri::command]
pub fn get_reminder_by_id(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::get_reminder_by_id(&conn, &id)
}

#[tauri::command]
pub fn create_reminder(
    state: State<'_, AppState>,
    payload: CreateReminderPayload,
) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::create_reminder(&conn, payload)
}

#[tauri::command]
pub fn update_reminder(
    state: State<'_, AppState>,
    payload: UpdateReminderPayload,
) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::update_reminder(&conn, payload)
}

#[tauri::command]
pub fn delete_reminder(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::delete_reminder(&conn, &id)
}

#[tauri::command]
pub fn toggle_reminder_status(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reminder_service::toggle_reminder_status(&conn, &id)
}
