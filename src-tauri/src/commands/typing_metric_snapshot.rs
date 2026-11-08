use tauri::State;

use crate::db::AppState;
use crate::models::typing_metric_snapshot::{
    CreateTypingSnapshotPayload, LiveTypingMetrics, TypingMetricSnapshot,
    TypingSnapshotHistoryFilter,
};
use crate::services::typing_metric_snapshot_service;
use crate::services::typing_monitor_service::TypingMonitorControl;

#[tauri::command]
pub fn record_typing_snapshot(
    state: State<'_, AppState>,
    payload: CreateTypingSnapshotPayload,
) -> Result<TypingMetricSnapshot, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    typing_metric_snapshot_service::record_typing_snapshot(&conn, payload)
}

#[tauri::command]
pub fn record_typing_snapshots_batch(
    state: State<'_, AppState>,
    payloads: Vec<CreateTypingSnapshotPayload>,
) -> Result<Vec<TypingMetricSnapshot>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    typing_metric_snapshot_service::record_typing_snapshots_batch(&conn, payloads)
}

#[tauri::command]
pub fn get_typing_snapshots_by_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<TypingMetricSnapshot>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    typing_metric_snapshot_service::get_typing_snapshots_by_session(&conn, &session_id)
}

#[tauri::command]
pub fn get_typing_history(
    state: State<'_, AppState>,
    filter: Option<TypingSnapshotHistoryFilter>,
) -> Result<Vec<TypingMetricSnapshot>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    typing_metric_snapshot_service::get_typing_history(&conn, filter.unwrap_or_default())
}

#[tauri::command]
pub fn delete_typing_snapshot(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    typing_metric_snapshot_service::delete_typing_snapshot(&conn, &id)
}

#[tauri::command]
pub fn get_live_typing_metrics(
    monitor: State<'_, TypingMonitorControl>,
) -> Result<LiveTypingMetrics, String> {
    monitor.get_live_metrics()
}

#[tauri::command]
pub fn set_typing_monitoring_paused(
    monitor: State<'_, TypingMonitorControl>,
    paused: bool,
) -> Result<LiveTypingMetrics, String> {
    monitor.set_paused(paused)
}

