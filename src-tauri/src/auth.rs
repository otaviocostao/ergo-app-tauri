use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{NaiveDate, Utc};
use rand_core::OsRng;
use serde::Serialize;
use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, SqlitePool};
use std::{
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;

use crate::models::user::{CreateUserPayload, User};

const USER_SELECT_FIELDS: &str = "id, external_id, first_name, last_name, birth_date, password_hash, email, phone, photo, created_at, updated_at";

#[derive(sqlx::FromRow)]
struct StoredUser {
    pub id: i64,
    pub external_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub password_hash: String,
    pub email: String,
    pub phone: String,
    pub photo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl StoredUser {
    fn into_user(self) -> User {
        User {
            id: self.id,
            external_id: self.external_id,
            first_name: self.first_name,
            last_name: self.last_name,
            birth_date: self.birth_date,
            email: self.email,
            phone: self.phone,
            photo: self.photo,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Session {
    #[default]
    Anonymous,
    Guest,
    Authenticated {
        user: User,
    },
}

#[derive(Debug, Serialize)]
pub struct AuthError {
    code: &'static str,
    message: &'static str,
}

impl AuthError {
    fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    fn internal() -> Self {
        Self::new(
            "internal",
            "Não foi possível acessar sua conta. Tente novamente.",
        )
    }

    fn invalid_credentials() -> Self {
        Self::new("invalid_credentials", "E-mail ou senha incorretos.")
    }
}

#[derive(Default)]
struct LoginAttempts {
    count: u8,
    window_start: Option<Instant>,
}

pub struct AuthStore {
    pool: SqlitePool,
    session: Mutex<Session>,
    attempts: Mutex<LoginAttempts>,
    dummy_hash: String,
}

fn hash_password(password: &str) -> Result<String, AuthError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| AuthError::internal())
}

fn normalize_email(email: &str) -> Result<String, AuthError> {
    let email = email.trim().to_lowercase();
    let valid = email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && domain.contains('.')
            && !domain.starts_with('.')
            && !domain.ends_with('.')
            && !domain.contains('@')
    });
    if !valid || email.len() > 254 || email.chars().any(char::is_whitespace) {
        return Err(AuthError::new("invalid_email", "Informe um e-mail válido."));
    }
    Ok(email)
}

fn normalize_optional(
    value: Option<String>,
    max_length: usize,
) -> Result<Option<String>, AuthError> {
    match value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
    {
        Some(item) if item.chars().count() > max_length => Err(AuthError::new(
            "invalid_optional_field",
            "Um dos campos opcionais excede o limite permitido.",
        )),
        value => Ok(value),
    }
}

impl AuthStore {
    pub async fn open(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(path)
                    .create_if_missing(true),
            )
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        // A missing account also goes through Argon2 verification.
        let dummy_hash = hash_password("not-a-user-password")
            .map_err(|_| std::io::Error::other("Falha ao inicializar a autenticação local"))?;
        Ok(Self {
            pool,
            session: Mutex::new(Session::Anonymous),
            attempts: Mutex::new(LoginAttempts::default()),
            dummy_hash,
        })
    }

    async fn register(&self, payload: CreateUserPayload) -> Result<User, AuthError> {
        let first_name = payload
            .first_name
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let last_name = payload
            .last_name
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if !(2..=60).contains(&first_name.chars().count()) {
            return Err(AuthError::new(
                "invalid_first_name",
                "Informe seu nome (2 a 60 caracteres).",
            ));
        }
        if !(2..=60).contains(&last_name.chars().count()) {
            return Err(AuthError::new(
                "invalid_last_name",
                "Informe seu sobrenome (2 a 60 caracteres).",
            ));
        }

        let birth_date = payload.birth_date.trim().to_string();
        let parsed_birth_date =
            NaiveDate::parse_from_str(&birth_date, "%Y-%m-%d").map_err(|_| {
                AuthError::new(
                    "invalid_birth_date",
                    "Informe uma data de nascimento válida.",
                )
            })?;
        if parsed_birth_date > Utc::now().date_naive() {
            return Err(AuthError::new(
                "invalid_birth_date",
                "A data de nascimento não pode estar no futuro.",
            ));
        }

        let email = normalize_email(&payload.email)?;
        let phone = payload.phone.trim().to_string();
        let phone_digit_count = phone
            .chars()
            .filter(|character| character.is_ascii_digit())
            .count();
        if !(8..=15).contains(&phone_digit_count) || phone.chars().count() > 30 {
            return Err(AuthError::new(
                "invalid_phone",
                "Informe um telefone válido.",
            ));
        }

        let external_id = normalize_optional(payload.external_id, 255)?;
        let photo = normalize_optional(payload.photo, 2048)?;

        if !(8..=128).contains(&payload.password.chars().count()) {
            return Err(AuthError::new(
                "invalid_password",
                "A senha deve ter entre 8 e 128 caracteres.",
            ));
        }
        let password_hash =
            tauri::async_runtime::spawn_blocking(move || hash_password(&payload.password))
                .await
                .map_err(|_| AuthError::internal())??;

        let result = sqlx::query(
            "INSERT INTO users (
                external_id, first_name, last_name, birth_date, password_hash,
                email, phone, photo
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&external_id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&birth_date)
        .bind(password_hash)
        .bind(&email)
        .bind(&phone)
        .bind(&photo)
        .execute(&self.pool)
        .await;

        match result {
            Ok(row) => {
                let query = format!("SELECT {} FROM users WHERE id = ?", USER_SELECT_FIELDS);
                let stored_user = sqlx::query_as::<_, StoredUser>(&query)
                    .bind(row.last_insert_rowid())
                    .fetch_one(&self.pool)
                    .await
                    .map_err(|_| AuthError::internal())?;
                Ok(stored_user.into_user())
            }
            Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
                Err(AuthError::new(
                    "email_in_use",
                    "Este e-mail já está cadastrado neste computador.",
                ))
            }
            Err(_) => Err(AuthError::internal()),
        }
    }

    fn reserve_login_attempt(&self) -> Result<(), AuthError> {
        let mut attempts = self.attempts.lock().map_err(|_| AuthError::internal())?;
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

    async fn login(&self, email: String, password: String) -> Result<Session, AuthError> {
        self.reserve_login_attempt()?;
        let email = normalize_email(&email).map_err(|_| AuthError::invalid_credentials())?;
        if password.is_empty() || password.chars().count() > 128 {
            return Err(AuthError::invalid_credentials());
        }
        let query = format!("SELECT {} FROM users WHERE email = ?", USER_SELECT_FIELDS);
        let row = sqlx::query_as::<_, StoredUser>(&query)
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map_err(|_| AuthError::internal())?;
        let hash = row
            .as_ref()
            .map(|row| &row.password_hash)
            .unwrap_or(&self.dummy_hash)
            .clone();
        let verified = tauri::async_runtime::spawn_blocking(move || {
            PasswordHash::new(&hash).is_ok_and(|parsed| {
                Argon2::default()
                    .verify_password(password.as_bytes(), &parsed)
                    .is_ok()
            })
        })
        .await
        .map_err(|_| AuthError::internal())?;
        match row {
            Some(stored_user) if verified => {
                let session = Session::Authenticated {
                    user: stored_user.into_user(),
                };
                self.set_session(session.clone())?;
                *self.attempts.lock().map_err(|_| AuthError::internal())? =
                    LoginAttempts::default();
                Ok(session)
            }
            _ => Err(AuthError::invalid_credentials()),
        }
    }

    fn set_session(&self, session: Session) -> Result<(), AuthError> {
        *self.session.lock().map_err(|_| AuthError::internal())? = session;
        Ok(())
    }

    fn session(&self) -> Result<Session, AuthError> {
        Ok(self
            .session
            .lock()
            .map_err(|_| AuthError::internal())?
            .clone())
    }
}

#[tauri::command]
pub async fn register_local(
    store: State<'_, AuthStore>,
    payload: CreateUserPayload,
) -> Result<User, AuthError> {
    store.register(payload).await
}

#[tauri::command]
pub async fn login_local(
    store: State<'_, AuthStore>,
    email: String,
    password: String,
) -> Result<Session, AuthError> {
    store.login(email, password).await
}

#[tauri::command]
pub fn get_session(store: State<'_, AuthStore>) -> Result<Session, AuthError> {
    store.session()
}

#[tauri::command]
pub fn continue_offline(store: State<'_, AuthStore>) -> Result<Session, AuthError> {
    store.set_session(Session::Guest)?;
    store.session()
}

#[tauri::command]
pub fn logout(store: State<'_, AuthStore>) -> Result<(), AuthError> {
    store.set_session(Session::Anonymous)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registration_payload(
        first_name: &str,
        last_name: &str,
        email: &str,
        password: &str,
    ) -> CreateUserPayload {
        CreateUserPayload {
            external_id: None,
            first_name: first_name.into(),
            last_name: last_name.into(),
            birth_date: "1995-05-20".into(),
            password: password.into(),
            email: email.into(),
            phone: "(75) 99999-9999".into(),
            photo: None,
        }
    }

    #[test]
    fn registration_login_and_persistence() {
        tauri::async_runtime::block_on(async {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("ergo.db");
            let store = AuthStore::open(&path).await.unwrap();
            let user = store
                .register(registration_payload(
                    "  Ana ",
                    " Silva ",
                    " ANA@example.com ",
                    "senha-segura-123",
                ))
                .await
                .unwrap();
            assert_eq!(user.first_name, "Ana");
            assert_eq!(user.last_name, "Silva");
            assert_eq!(user.birth_date, "1995-05-20");
            assert_eq!(user.email, "ana@example.com");
            assert_eq!(user.phone, "(75) 99999-9999");
            assert_eq!(user.external_id, None);
            assert_eq!(user.photo, None);
            assert!(matches!(store.session().unwrap(), Session::Anonymous));
            let hash: String = sqlx::query_scalar("SELECT password_hash FROM users")
                .fetch_one(&store.pool)
                .await
                .unwrap();
            assert!(hash.starts_with("$argon2id$"));
            assert!(!hash.contains("senha-segura-123"));
            assert!(!serde_json::to_string(&user).unwrap().contains("password"));
            assert_eq!(
                store
                    .register(registration_payload(
                        "Outra",
                        "Ana",
                        "ANA@example.com",
                        "outra-senha",
                    ))
                    .await
                    .unwrap_err()
                    .code,
                "email_in_use"
            );
            assert_eq!(
                store
                    .login("ana@example.com".into(), "senha-errada".into())
                    .await
                    .unwrap_err()
                    .code,
                "invalid_credentials"
            );
            assert!(matches!(store.session().unwrap(), Session::Anonymous));
            let session = store
                .login("ANA@EXAMPLE.COM".into(), "senha-segura-123".into())
                .await
                .unwrap();
            assert!(matches!(session, Session::Authenticated { .. }));
            store.set_session(Session::Anonymous).unwrap();
            assert!(matches!(store.session().unwrap(), Session::Anonymous));
            store.set_session(Session::Guest).unwrap();
            assert!(matches!(store.session().unwrap(), Session::Guest));
            store.pool.close().await;
            let reopened = AuthStore::open(&path).await.unwrap();
            assert!(matches!(reopened.session().unwrap(), Session::Anonymous));
            assert!(reopened
                .login("ana@example.com".into(), "senha-segura-123".into())
                .await
                .is_ok());
            reopened.pool.close().await;
        });
    }

    #[test]
    fn invalid_registration_and_attempt_limit() {
        tauri::async_runtime::block_on(async {
            let directory = tempfile::tempdir().unwrap();
            let store = AuthStore::open(&directory.path().join("ergo.db"))
                .await
                .unwrap();
            assert_eq!(
                store
                    .register(registration_payload(
                        "A",
                        "Silva",
                        "ana@example.com",
                        "senha-segura",
                    ))
                    .await
                    .unwrap_err()
                    .code,
                "invalid_first_name"
            );
            assert_eq!(
                store
                    .register(registration_payload(
                        "Ana",
                        "Silva",
                        "email-invalido",
                        "senha-segura",
                    ))
                    .await
                    .unwrap_err()
                    .code,
                "invalid_email"
            );
            assert_eq!(
                store
                    .register(registration_payload(
                        "Ana",
                        "Silva",
                        "ana@example.com",
                        "1234567",
                    ))
                    .await
                    .unwrap_err()
                    .code,
                "invalid_password"
            );
            for _ in 0..5 {
                assert_eq!(
                    store
                        .login("naoexiste@example.com".into(), "senha-segura".into())
                        .await
                        .unwrap_err()
                        .code,
                    "invalid_credentials"
                );
            }
            assert_eq!(
                store
                    .login("naoexiste@example.com".into(), "senha-segura".into())
                    .await
                    .unwrap_err()
                    .code,
                "rate_limited"
            );
            store.attempts.lock().unwrap().window_start =
                Some(Instant::now() - Duration::from_secs(31));
            assert_eq!(
                store
                    .login("naoexiste@example.com".into(), "senha-segura".into())
                    .await
                    .unwrap_err()
                    .code,
                "invalid_credentials"
            );
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
                .fetch_one(&store.pool)
                .await
                .unwrap();
            assert_eq!(count, 0);
            store.pool.close().await;
        });
    }
}
