use tauri::State;

use crate::db::AppState;
use crate::models::monitoring_session::{
    CreateSessionPayload, EndSessionPayload, MonitoringSession,
};
use crate::services::auth_service::AuthState;
use crate::services::monitoring_session_service;
use crate::services::typing_monitor_service::{self, TypingMonitorControl};

#[tauri::command]
pub fn start_monitoring_session(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    typing_monitor: State<'_, TypingMonitorControl>,
    payload: Option<CreateSessionPayload>,
) -> Result<MonitoringSession, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let session = monitoring_session_service::start_monitoring_session(&conn, payload)?;
    let (has_auth, auth_uid, module_enabled) =
        typing_monitor_service::resolve_typing_access(&conn, &auth_state)?;
    let can_capture = has_auth && auth_uid == session.user_id && module_enabled;
    let _ = typing_monitor.attach_session(session.user_id.clone(), session.id.clone(), can_capture);
    Ok(session)
}

#[tauri::command]
pub fn end_monitoring_session(
    state: State<'_, AppState>,
    typing_monitor: State<'_, TypingMonitorControl>,
    payload: EndSessionPayload,
) -> Result<MonitoringSession, String> {
    let session_id = payload.id.clone();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let ended = monitoring_session_service::end_monitoring_session(&conn, payload)?;
    typing_monitor.detach_session(&conn, &session_id)?;
    Ok(ended)
}

#[tauri::command]
pub fn get_monitoring_sessions(
    state: State<'_, AppState>,
    user_id: Option<String>,
) -> Result<Vec<MonitoringSession>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::get_monitoring_sessions(&conn, user_id.as_deref())
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
    user_id: Option<String>,
) -> Result<Option<MonitoringSession>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    monitoring_session_service::get_active_monitoring_session(&conn, user_id.as_deref())
}

#[tauri::command]
pub fn delete_monitoring_session(
    state: State<'_, AppState>,
    typing_monitor: State<'_, TypingMonitorControl>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let deleted = monitoring_session_service::delete_monitoring_session(&conn, &id)?;
    if deleted {
        typing_monitor.detach_session(&conn, &id)?;
    }
    Ok(deleted)
}
