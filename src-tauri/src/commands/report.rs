use tauri::State;

use crate::db::AppState;
use crate::models::report::{ReportData, ReportFilter};
use crate::services::{auth_service::AuthState, report_service};

#[tauri::command]
pub fn get_report_data(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    filter: ReportFilter,
) -> Result<ReportData, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    report_service::get_report_data(&conn, &auth_state, filter)
}
