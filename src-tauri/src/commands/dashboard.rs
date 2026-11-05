use tauri::State;

use crate::db::AppState;
use crate::models::dashboard::{DashboardData, DashboardFilter};
use crate::services::{auth_service::AuthState, dashboard_service};

#[tauri::command]
pub fn get_dashboard_data(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    filter: DashboardFilter,
) -> Result<DashboardData, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    dashboard_service::get_dashboard_data(&conn, &auth_state, filter)
}
