use tauri::State;

use crate::db::AppState;
use crate::models::auth::{AuthError, Session};
use crate::models::user::{CreateUserPayload, User};
use crate::services::auth_service::AuthState;
use crate::services::{auth_service, user_service};

#[tauri::command]
pub fn register_local(
    state: State<'_, AppState>,
    payload: CreateUserPayload,
) -> Result<User, AuthError> {
    let conn = state.db.lock().map_err(|_| AuthError::internal())?;
    user_service::create_user(&conn, payload)
}

#[tauri::command]
pub fn login_local(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    email: String,
    password: String,
) -> Result<Session, AuthError> {
    let conn = state.db.lock().map_err(|_| AuthError::internal())?;
    auth_service::login(&conn, &auth_state, email, password)
}

#[tauri::command]
pub fn get_session(auth_state: State<'_, AuthState>) -> Result<Session, AuthError> {
    auth_service::get_session(&auth_state)
}

#[tauri::command]
pub fn continue_offline(auth_state: State<'_, AuthState>) -> Result<Session, AuthError> {
    auth_service::continue_offline(&auth_state)
}

#[tauri::command]
pub fn logout(auth_state: State<'_, AuthState>) -> Result<(), AuthError> {
    auth_service::logout(&auth_state)
}
