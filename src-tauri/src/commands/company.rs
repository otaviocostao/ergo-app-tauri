use tauri::State;

use crate::db::AppState;
use crate::models::company::{Company, CreateCompanyPayload, UpdateCompanyPayload};
use crate::services::company_service;

#[tauri::command]
pub fn get_companies(state: State<'_, AppState>) -> Result<Vec<Company>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    company_service::get_companies(&conn)
}

#[tauri::command]
pub fn get_company_by_id(state: State<'_, AppState>, id: String) -> Result<Company, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    company_service::get_company_by_id(&conn, &id)
}

#[tauri::command]
pub fn create_company(
    state: State<'_, AppState>,
    payload: CreateCompanyPayload,
) -> Result<Company, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    company_service::create_company(&conn, payload)
}

#[tauri::command]
pub fn update_company(
    state: State<'_, AppState>,
    payload: UpdateCompanyPayload,
) -> Result<Company, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    company_service::update_company(&conn, payload)
}

#[tauri::command]
pub fn delete_company(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    company_service::delete_company(&conn, &id)
}
