use tauri::State;

use crate::db::AppState;
use crate::models::posture_alert::{
    AlertFilter, CreateAlertPayload, PostureAlert, ResolveAlertPayload,
};
use crate::services::posture_alert_service;

#[tauri::command]
pub fn record_posture_alert(
    state: State<'_, AppState>,
    payload: CreateAlertPayload,
) -> Result<PostureAlert, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_alert_service::record_posture_alert(&conn, payload)
}

#[tauri::command]
pub fn resolve_posture_alert(
    state: State<'_, AppState>,
    payload: ResolveAlertPayload,
) -> Result<PostureAlert, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_alert_service::resolve_posture_alert(&conn, payload)
}

#[tauri::command]
pub fn get_alerts_by_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<PostureAlert>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_alert_service::get_alerts_by_session(&conn, &session_id)
}

#[tauri::command]
pub fn get_posture_alerts(
    state: State<'_, AppState>,
    filter: AlertFilter,
) -> Result<Vec<PostureAlert>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_alert_service::get_posture_alerts(&conn, filter)
}

#[tauri::command]
pub fn delete_posture_alert(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_alert_service::delete_posture_alert(&conn, &id)
}
