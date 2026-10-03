use chrono::{NaiveDate, Utc};
use rusqlite::Connection;

use crate::models::auth::AuthError;
use crate::models::user::{CreateUserPayload, NewUser, User};
use crate::repositories::user_repository;
use crate::services::auth_service;

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

pub fn create_user(conn: &Connection, payload: CreateUserPayload) -> Result<User, AuthError> {
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
    let parsed_birth_date = NaiveDate::parse_from_str(&birth_date, "%Y-%m-%d").map_err(|_| {
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

    if !(8..=128).contains(&payload.password.chars().count()) {
        return Err(AuthError::new(
            "invalid_password",
            "A senha deve ter entre 8 e 128 caracteres.",
        ));
    }

    if user_repository::find_by_email(conn, &email)
        .map_err(|_| AuthError::internal())?
        .is_some()
    {
        return Err(AuthError::new(
            "email_in_use",
            "Este e-mail já está cadastrado neste computador.",
        ));
    }

    let new_user = NewUser {
        external_id: normalize_optional(payload.external_id, 255)?,
        first_name,
        last_name,
        birth_date,
        password_hash: auth_service::hash_password(&payload.password)?,
        email,
        phone,
        photo: normalize_optional(payload.photo, 2048)?,
    };

    let id = user_repository::insert(conn, &new_user).map_err(|error| match error {
        rusqlite::Error::SqliteFailure(code, _)
            if code.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            AuthError::new(
                "email_in_use",
                "Este e-mail já está cadastrado neste computador.",
            )
        }
        _ => AuthError::internal(),
    })?;

    user_repository::find_by_id(conn, id)
        .map_err(|_| AuthError::internal())?
        .map(|stored| stored.user)
        .ok_or_else(AuthError::internal)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn
    }

    fn registration_payload(first_name: &str, email: &str, password: &str) -> CreateUserPayload {
        CreateUserPayload {
            external_id: None,
            first_name: first_name.into(),
            last_name: "Silva".into(),
            birth_date: "1995-05-20".into(),
            password: password.into(),
            email: email.into(),
            phone: "(75) 99999-9999".into(),
            photo: None,
        }
    }

    #[test]
    fn creates_normalized_user_without_exposing_password() {
        let conn = test_connection();
        let user = create_user(
            &conn,
            registration_payload("  Ana Maria ", " ANA@example.com ", "senha-segura-123"),
        )
        .unwrap();

        assert_eq!(user.first_name, "Ana Maria");
        assert_eq!(user.email, "ana@example.com");
        assert_eq!(user.external_id, None);
        assert_eq!(user.photo, None);
        assert!(!serde_json::to_string(&user).unwrap().contains("password"));

        let stored = user_repository::find_by_id(&conn, user.id)
            .unwrap()
            .unwrap();
        assert!(stored.password_hash.starts_with("$argon2id$"));
        assert!(!stored.password_hash.contains("senha-segura-123"));
    }

    #[test]
    fn rejects_invalid_and_duplicate_registration() {
        let conn = test_connection();
        assert_eq!(
            create_user(
                &conn,
                registration_payload("A", "ana@example.com", "senha-segura")
            )
            .unwrap_err()
            .code,
            "invalid_first_name"
        );
        assert_eq!(
            create_user(
                &conn,
                registration_payload("Ana", "email-invalido", "senha-segura")
            )
            .unwrap_err()
            .code,
            "invalid_email"
        );
        assert_eq!(
            create_user(
                &conn,
                registration_payload("Ana", "ana@example.com", "1234567")
            )
            .unwrap_err()
            .code,
            "invalid_password"
        );

        create_user(
            &conn,
            registration_payload("Ana", "ana@example.com", "senha-segura"),
        )
        .unwrap();
        assert_eq!(
            create_user(
                &conn,
                registration_payload("Outra", "ANA@example.com", "outra-senha")
            )
            .unwrap_err()
            .code,
            "email_in_use"
        );
        assert_eq!(user_repository::count(&conn).unwrap(), 1);
    }
}
