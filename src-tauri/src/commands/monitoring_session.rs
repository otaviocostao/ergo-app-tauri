use tauri::State;

use crate::db::AppState;
use crate::models::monitoring_session::{
    CreateSessionPayload, EndSessionPayload, MonitoringSession,
};
use crate::services::monitoring_session_service;

#[tauri::command]
pub fn start_monitoring_session(
    state: State<'_, AppState>,
    payload: Option<CreateSessionPayload>,
) -> Result<MonitoringSession, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::start_monitoring_session(&conn, payload)
}

#[tauri::command]
pub fn end_monitoring_session(
    state: State<'_, AppState>,
    payload: EndSessionPayload,
) -> Result<MonitoringSession, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::end_monitoring_session(&conn, payload)
}

#[tauri::command]
pub fn get_monitoring_sessions(
    state: State<'_, AppState>,
    user_id: Option<i64>,
) -> Result<Vec<MonitoringSession>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::get_monitoring_sessions(&conn, user_id)
}

#[tauri::command]
pub fn get_monitoring_session_by_id(
    state: State<'_, AppState>,
    id: String,
) -> Result<MonitoringSession, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::get_monitoring_session_by_id(&conn, &id)
}

#[tauri::command]
pub fn get_active_monitoring_session(
    state: State<'_, AppState>,
    user_id: Option<i64>,
) -> Result<Option<MonitoringSession>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::get_active_monitoring_session(&conn, user_id)
}

#[tauri::command]
pub fn delete_monitoring_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::delete_monitoring_session(&conn, &id)
}
