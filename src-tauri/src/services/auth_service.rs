use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::Connection;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use crate::models::auth::{AuthError, Session};
use crate::repositories::user_repository;

#[derive(Default)]
struct LoginAttempts {
    count: u8,
    window_start: Option<Instant>,
}

pub struct AuthState {
    session: Mutex<Session>,
    attempts: Mutex<LoginAttempts>,
    dummy_hash: String,
}

impl AuthState {
    pub fn new() -> Result<Self, AuthError> {
        Ok(Self {
            session: Mutex::new(Session::Anonymous),
            attempts: Mutex::new(LoginAttempts::default()),
            dummy_hash: hash_password("not-a-user-password")?,
        })
    }

    pub(crate) fn with_authenticated_user<T>(
        &self,
        action: impl FnOnce(Option<i64>) -> T,
    ) -> Result<T, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Failed to read authentication session".to_string())?;
        let user_id = match &*session {
            Session::Authenticated { user } => Some(user.id),
            _ => None,
        };
        Ok(action(user_id))
    }
}

pub(crate) fn hash_password(password: &str) -> Result<String, AuthError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| AuthError::internal())
}

fn verify_password(password: &str, password_hash: &str) -> bool {
    PasswordHash::new(password_hash).is_ok_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}

fn reserve_login_attempt(state: &AuthState) -> Result<(), AuthError> {
    let mut attempts = state.attempts.lock().map_err(|_| AuthError::internal())?;
    if attempts
        .window_start
        .is_none_or(|start| start.elapsed() >= Duration::from_secs(30))
    {
        *attempts = LoginAttempts {
            count: 0,
            window_start: Some(Instant::now()),
        };
    }
    if attempts.count >= 5 {
        return Err(AuthError::new(
            "rate_limited",
            "Muitas tentativas. Aguarde 30 segundos e tente novamente.",
        ));
    }
    attempts.count += 1;
    Ok(())
}

fn normalize_login_email(email: &str) -> Result<String, AuthError> {
    let email = email.trim().to_lowercase();
    let valid = email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && domain.contains('.')
            && !domain.starts_with('.')
            && !domain.ends_with('.')
            && !domain.contains('@')
    });
    if !valid || email.len() > 254 || email.chars().any(char::is_whitespace) {
        return Err(AuthError::invalid_credentials());
    }
    Ok(email)
}

pub fn login(
    conn: &Connection,
    state: &AuthState,
    email: String,
    password: String,
) -> Result<Session, AuthError> {
    reserve_login_attempt(state)?;
    let email = normalize_login_email(&email)?;
    if password.is_empty() || password.chars().count() > 128 {
        return Err(AuthError::invalid_credentials());
    }

    let stored_user =
        user_repository::find_by_email(conn, &email).map_err(|_| AuthError::internal())?;
    let password_hash = stored_user
        .as_ref()
        .map(|stored| stored.password_hash.as_str())
        .unwrap_or(&state.dummy_hash);
    let verified = verify_password(&password, password_hash);

    match stored_user {
        Some(stored) if verified => {
            let session = Session::Authenticated {
                user: Box::new(stored.user),
            };
            set_session(state, session.clone())?;
            *state.attempts.lock().map_err(|_| AuthError::internal())? = LoginAttempts::default();
            Ok(session)
        }
        _ => Err(AuthError::invalid_credentials()),
    }
}

pub fn get_session(state: &AuthState) -> Result<Session, AuthError> {
    state
        .session
        .lock()
        .map(|session| session.clone())
        .map_err(|_| AuthError::internal())
}

pub fn require_authenticated_user_id(state: &AuthState) -> Result<i64, String> {
    match get_session(state).map_err(|_| "Failed to read authentication session".to_string())? {
        Session::Authenticated { user } => Ok(user.id),
        Session::Anonymous | Session::Guest => {
            Err("Authentication is required to manage reminders".to_string())
        }
    }
}

pub fn set_session(state: &AuthState, session: Session) -> Result<(), AuthError> {
    *state.session.lock().map_err(|_| AuthError::internal())? = session;
    Ok(())
}

pub fn continue_offline(state: &AuthState) -> Result<Session, AuthError> {
    set_session(state, Session::Guest)?;
    get_session(state)
}

pub fn logout(state: &AuthState) -> Result<(), AuthError> {
    set_session(state, Session::Anonymous)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::user::CreateUserPayload;
    use crate::services::user_service;

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn
    }

    fn registration_payload() -> CreateUserPayload {
        CreateUserPayload {
            external_id: None,
            first_name: "Ana".into(),
            last_name: "Silva".into(),
            birth_date: "1995-05-20".into(),
            password: "senha-segura-123".into(),
            email: "ana@example.com".into(),
            phone: "(75) 99999-9999".into(),
            photo: None,
        }
    }

    #[test]
    fn login_and_session_lifecycle() {
        let conn = test_connection();
        user_service::create_user(&conn, registration_payload()).unwrap();
        let state = AuthState::new().unwrap();

        assert_eq!(
            login(
                &conn,
                &state,
                "ana@example.com".into(),
                "senha-errada".into()
            )
            .unwrap_err()
            .code,
            "invalid_credentials"
        );
        assert!(matches!(get_session(&state).unwrap(), Session::Anonymous));

        let session = login(
            &conn,
            &state,
            "ANA@EXAMPLE.COM".into(),
            "senha-segura-123".into(),
        )
        .unwrap();
        assert!(matches!(session, Session::Authenticated { .. }));
        let serialized = serde_json::to_value(&session).unwrap();
        assert_eq!(serialized["kind"], "authenticated");
        assert_eq!(serialized["user"]["email"], "ana@example.com");

        logout(&state).unwrap();
        assert!(matches!(get_session(&state).unwrap(), Session::Anonymous));
        assert!(matches!(continue_offline(&state).unwrap(), Session::Guest));
    }

    #[test]
    fn login_attempt_limit_resets_after_window() {
        let conn = test_connection();
        let state = AuthState::new().unwrap();

        for _ in 0..5 {
            assert_eq!(
                login(
                    &conn,
                    &state,
                    "missing@example.com".into(),
                    "senha-segura".into()
                )
                .unwrap_err()
                .code,
                "invalid_credentials"
            );
        }
        assert_eq!(
            login(
                &conn,
                &state,
                "missing@example.com".into(),
                "senha-segura".into()
            )
            .unwrap_err()
            .code,
            "rate_limited"
        );

        state.attempts.lock().unwrap().window_start =
            Some(Instant::now() - Duration::from_secs(31));
        assert_eq!(
            login(
                &conn,
                &state,
                "missing@example.com".into(),
                "senha-segura".into()
            )
            .unwrap_err()
            .code,
            "invalid_credentials"
        );
    }
}
