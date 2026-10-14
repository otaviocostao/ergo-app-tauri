use tauri::State;

use crate::db::AppState;
use crate::models::auth::Session;
use crate::models::user::{UpdateUserPayload, User};
use crate::services::auth_service::{self, AuthState};
use crate::services::user_service;

#[tauri::command]
pub fn is_local_user(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    user_service::is_local_user(&conn, id)
}

#[tauri::command]
pub fn update_user(
    state: State<'_, AppState>,
    auth_state: State<'_, AuthState>,
    payload: UpdateUserPayload,
) -> Result<User, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let updated_user = user_service::update_user(&conn, payload)?;

    // Sincroniza a sessão em memória caso o usuário atualizado seja o usuário autenticado atual
    if let Ok(Session::Authenticated { ref user }) = auth_service::get_session(&auth_state) {
        if user.id == updated_user.id {
            let _ = auth_service::set_session(
                &auth_state,
                Session::Authenticated {
                    user: Box::new(updated_user.clone()),
                },
            );
        }
    }

    Ok(updated_user)
}
