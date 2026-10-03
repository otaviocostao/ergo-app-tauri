use tauri::State;

use crate::db::AppState;
use crate::models::workspace::{
    CreateWorkspacePayload, UpdateWorkspacePayload, Workspace,
};
use crate::services::workspace_service;

#[tauri::command]
pub fn get_workspaces(state: State<'_, AppState>) -> Result<Vec<Workspace>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    workspace_service::get_workspaces(&conn)
}

#[tauri::command]
pub fn get_workspace_by_id(state: State<'_, AppState>, id: String) -> Result<Workspace, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    workspace_service::get_workspace_by_id(&conn, &id)
}

#[tauri::command]
pub fn create_workspace(
    state: State<'_, AppState>,
    payload: CreateWorkspacePayload,
) -> Result<Workspace, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    workspace_service::create_workspace(&conn, payload)
}

#[tauri::command]
pub fn update_workspace(
    state: State<'_, AppState>,
    payload: UpdateWorkspacePayload,
) -> Result<Workspace, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    workspace_service::update_workspace(&conn, payload)
}

#[tauri::command]
pub fn delete_workspace(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    workspace_service::delete_workspace(&conn, &id)
}
