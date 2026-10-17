use tauri::State;

use crate::db::AppState;
use crate::models::posture_calibration::{PostureCalibration, SaveCalibrationPayload};
use crate::services::posture_calibration_service;

#[tauri::command]
pub fn save_posture_calibration(
    state: State<'_, AppState>,
    payload: SaveCalibrationPayload,
) -> Result<PostureCalibration, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_calibration_service::save_posture_calibration(&conn, payload)
}

#[tauri::command]
pub fn get_active_calibration(
    state: State<'_, AppState>,
    user_id: Option<i64>,
) -> Result<Option<PostureCalibration>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_calibration_service::get_active_calibration(&conn, user_id)
}

#[tauri::command]
pub fn get_posture_calibrations(
    state: State<'_, AppState>,
) -> Result<Vec<PostureCalibration>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_calibration_service::get_posture_calibrations(&conn)
}

#[tauri::command]
pub fn delete_posture_calibration(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    posture_calibration_service::delete_posture_calibration(&conn, &id)
}
