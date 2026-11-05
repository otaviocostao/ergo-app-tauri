use tauri::State;

use crate::{
    db::AppState,
    models::session_history::SessionHistory,
    services::{auth_service::AuthState, session_history_service},
};

#[tauri::command]
pub fn get_session_history(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
) -> Result<SessionHistory, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    session_history_service::get_session_history(&conn, &auth_state)
}
