use tauri::State;

use crate::db::AppState;
use crate::models::posture_metric_snapshot::{
    CreateSnapshotPayload, PostureMetricSnapshot, SnapshotHistoryFilter,
};
use crate::services::posture_metric_snapshot_service;

#[tauri::command]
pub fn record_metric_snapshot(
    state: State<'_, AppState>,
    payload: CreateSnapshotPayload,
) -> Result<PostureMetricSnapshot, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_metric_snapshot_service::record_metric_snapshot(&conn, payload)
}

#[tauri::command]
pub fn record_metric_snapshots_batch(
    state: State<'_, AppState>,
    payloads: Vec<CreateSnapshotPayload>,
) -> Result<Vec<PostureMetricSnapshot>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_metric_snapshot_service::record_metric_snapshots_batch(&conn, payloads)
}

#[tauri::command]
pub fn get_snapshots_by_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<PostureMetricSnapshot>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_metric_snapshot_service::get_snapshots_by_session(&conn, &session_id)
}

#[tauri::command]
pub fn get_posture_history(
    state: State<'_, AppState>,
    filter: SnapshotHistoryFilter,
) -> Result<Vec<PostureMetricSnapshot>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_metric_snapshot_service::get_posture_history(&conn, filter)
}

#[tauri::command]
pub fn delete_metric_snapshot(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_metric_snapshot_service::delete_metric_snapshot(&conn, &id)
}
