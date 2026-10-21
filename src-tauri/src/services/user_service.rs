use chrono::{Datelike, Local, Months, NaiveDate};
use rusqlite::Connection;

use crate::models::auth::AuthError;
use crate::models::user::{CreateUserPayload, NewUser, UpdateUserPayload, User};
use crate::repositories::user_repository;
use crate::services::auth_service;

fn normalize_birth_date(value: &str, today: NaiveDate) -> Result<String, AuthError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    let invalid_date = || {
        AuthError::new(
            "invalid_birth_date",
            "Informe uma data de nascimento válida.",
        )
    };
    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| invalid_date())?;
    if date.format("%Y-%m-%d").to_string() != value || date.year() < 1 {
        return Err(invalid_date());
    }
    if date > today {
        return Err(AuthError::new(
            "future_birth_date",
            "A data de nascimento não pode estar no futuro.",
        ));
    }
    let earliest = today
        .checked_sub_months(Months::new(101 * 12))
        .and_then(|date| date.succ_opt())
        .ok_or_else(AuthError::internal)?;
    let latest = today
        .checked_sub_months(Months::new(14 * 12))
        .ok_or_else(AuthError::internal)?;
    if date < earliest {
        return Err(AuthError::new(
            "birth_date_too_old",
            "A data de nascimento não pode indicar mais de 100 anos.",
        ));
    }
    if date > latest {
        return Err(AuthError::new(
            "birth_date_too_recent",
            "A data de nascimento deve indicar pelo menos 14 anos.",
        ));
    }
    Ok(value.to_string())
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

pub fn is_local_user(conn: &Connection, id: i64) -> Result<bool, String> {
    let stored = user_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("User with id '{}' not found", id))?;

    let has_external_id = stored
        .user
        .external_id
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    Ok(!has_external_id)
}

pub fn validate_is_local_user(conn: &Connection, id: i64) -> Result<(), String> {
    let is_local = is_local_user(conn, id)?;
    if !is_local {
        return Err("Online platform users cannot have their data updated locally.".to_string());
    }
    Ok(())
}

pub fn update_user(conn: &Connection, payload: UpdateUserPayload) -> Result<User, String> {
    validate_is_local_user(conn, payload.id)?;

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
        return Err("First name must be between 2 and 60 characters.".to_string());
    }
    if !(2..=60).contains(&last_name.chars().count()) {
        return Err("Last name must be between 2 and 60 characters.".to_string());
    }

    let birth_date = normalize_birth_date(&payload.birth_date, Local::now().date_naive())
        .map_err(|error| error.message.to_string())?;

    let email = normalize_email(&payload.email).map_err(|e| e.message.to_string())?;

    if let Some(existing) =
        user_repository::find_by_email(conn, &email).map_err(|e| e.to_string())?
    {
        if existing.user.id != payload.id {
            return Err("This email is already in use by another user.".to_string());
        }
    }

    let phone = payload.phone.trim().to_string();
    let phone_digit_count = phone
        .chars()
        .filter(|character| character.is_ascii_digit())
        .count();
    if !phone.is_empty() && (!(8..=15).contains(&phone_digit_count) || phone.chars().count() > 30) {
        return Err("Please enter a valid phone number.".to_string());
    }

    let photo = payload
        .photo
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty());

    let rows_affected = user_repository::update(
        conn,
        payload.id,
        &first_name,
        &last_name,
        &birth_date,
        &email,
        &phone,
        photo.as_deref(),
    )
    .map_err(|e| e.to_string())?;

    if rows_affected == 0 {
        return Err(format!("User with id '{}' not found", payload.id));
    }

    user_repository::find_by_id(conn, payload.id)
        .map_err(|e| e.to_string())?
        .map(|stored| stored.user)
        .ok_or_else(|| format!("User with id '{}' not found after update", payload.id))
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

    let birth_date = normalize_birth_date(&payload.birth_date, Local::now().date_naive())?;

    let email = normalize_email(&payload.email)?;
    let phone = payload.phone.trim().to_string();
    let phone_digit_count = phone
        .chars()
        .filter(|character| character.is_ascii_digit())
        .count();
    if !phone.is_empty()
        && (phone_digit_count != 11
            || phone.chars().count() > 15
            || phone.chars().any(|character| {
                !character.is_ascii_digit() && !matches!(character, '(' | ')' | ' ' | '-')
            }))
    {
        return Err(AuthError::new(
            "invalid_phone",
            "Informe o telefone com DDD e 9 dígitos.",
        ));
    }

    if !(8..=70).contains(&payload.password.chars().count()) {
        return Err(AuthError::new(
            "invalid_password",
            "A senha deve ter entre 8 e 70 caracteres.",
        ));
    }
    let password = &payload.password;
    if !password.chars().any(char::is_lowercase)
        || !password.chars().any(char::is_uppercase)
        || !password.chars().any(|character| character.is_ascii_digit())
        || !password
            .chars()
            .any(|character| character.is_ascii_punctuation())
    {
        return Err(AuthError::new(
            "invalid_password",
            "Inclua uma letra maiúscula, uma minúscula, um número e um símbolo na senha.",
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
    fn validates_optional_birth_dates_and_distinct_errors() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 20).unwrap();
        for value in [
            "",
            "   ",
            "1925-10-21",
            "1926-10-19",
            "1926-10-20",
            "2012-10-20",
            "2000-02-29",
        ] {
            assert!(normalize_birth_date(value, today).is_ok(), "{value}");
        }
        for (value, code) in [
            ("2000-02-31", "invalid_birth_date"),
            ("2001-02-29", "invalid_birth_date"),
            ("0000-01-01", "invalid_birth_date"),
            ("2000-2-01", "invalid_birth_date"),
            ("31/02/2000", "invalid_birth_date"),
            ("1925-10-20", "birth_date_too_old"),
            ("2012-10-21", "birth_date_too_recent"),
            ("2026-01-01", "birth_date_too_recent"),
            ("2026-10-20", "birth_date_too_recent"),
            ("2026-10-21", "future_birth_date"),
        ] {
            assert_eq!(
                normalize_birth_date(value, today).unwrap_err().code,
                code,
                "{value}"
            );
        }
    }

    #[test]
    fn clamps_birth_date_age_cutoffs_on_leap_days() {
        let today = NaiveDate::from_ymd_opt(2024, 2, 29).unwrap();
        for value in ["2010-02-28", "1924-02-29", "1923-03-01"] {
            assert!(normalize_birth_date(value, today).is_ok());
        }
        assert_eq!(
            normalize_birth_date("2010-03-01", today).unwrap_err().code,
            "birth_date_too_recent"
        );
        assert_eq!(
            normalize_birth_date("1923-02-28", today).unwrap_err().code,
            "birth_date_too_old"
        );
    }

    #[test]
    fn creates_and_updates_users_without_optional_personal_fields() {
        let conn = test_connection();
        let payload: CreateUserPayload = serde_json::from_value(serde_json::json!({
            "firstName": "Ana",
            "lastName": "Silva",
            "email": "ana@example.com",
            "password": "Senha-segura-123!"
        }))
        .unwrap();
        let user = create_user(&conn, payload).unwrap();
        assert_eq!(user.birth_date, "");
        assert_eq!(user.phone, "");

        let updated = update_user(
            &conn,
            UpdateUserPayload {
                id: user.id,
                first_name: "Ana Maria".into(),
                last_name: user.last_name,
                birth_date: "   ".into(),
                email: user.email,
                phone: "   ".into(),
                photo: None,
            },
        )
        .unwrap();
        assert_eq!(updated.first_name, "Ana Maria");
        assert_eq!(updated.birth_date, "");
        assert_eq!(updated.phone, "");
    }

    #[test]
    fn rejects_invalid_registration_birth_dates_before_persisting() {
        let conn = test_connection();
        let mut payload = registration_payload("Ana", "ana@example.com", "Senha-segura-123!");
        payload.birth_date = "2000-02-31".into();
        assert_eq!(
            create_user(&conn, payload).unwrap_err().code,
            "invalid_birth_date"
        );
        assert_eq!(user_repository::count(&conn).unwrap(), 0);
    }

    #[test]
    fn can_clear_existing_optional_personal_fields() {
        let conn = test_connection();
        let user = create_user(
            &conn,
            registration_payload("Ana", "ana@example.com", "Senha-segura-123!"),
        )
        .unwrap();
        assert!(!user.birth_date.is_empty());
        assert!(!user.phone.is_empty());
        let payload = UpdateUserPayload {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            birth_date: String::new(),
            email: user.email,
            phone: String::new(),
            photo: None,
        };
        let updated = update_user(&conn, payload.clone()).unwrap();
        assert_eq!(updated.birth_date, "");
        assert_eq!(updated.phone, "");

        let mut invalid = payload;
        invalid.birth_date = "2000-02-31".into();
        assert_eq!(
            update_user(&conn, invalid).unwrap_err(),
            "Informe uma data de nascimento válida."
        );
        assert_eq!(
            user_repository::find_by_id(&conn, user.id)
                .unwrap()
                .unwrap()
                .user
                .birth_date,
            ""
        );
    }

    #[test]
    fn creates_normalized_user_without_exposing_password() {
        let conn = test_connection();
        let user = create_user(
            &conn,
            registration_payload("  Ana Maria ", " ANA@example.com ", "Senha-segura-123!"),
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
        assert!(!stored.password_hash.contains("Senha-segura-123!"));
    }

    #[test]
    fn rejects_passwords_that_do_not_meet_registration_policy() {
        let conn = test_connection();
        let too_long = format!("Aa1!{}", "x".repeat(67));
        let passwords = [
            "Aa1!abc",         // Too short.
            too_long.as_str(), // More than 70 characters.
            "abcdefgh1!",      // No uppercase letter.
            "ABCDEFGH1!",      // No lowercase letter.
            "Abcdefgh!",       // No number.
            "Abcdefgh1",       // No symbol.
            "Abcdefg1 ",       // A space is not a symbol.
        ];
        for password in passwords {
            let error = create_user(
                &conn,
                registration_payload("Ana", "ana@example.com", password),
            )
            .unwrap_err();
            assert_eq!(error.code, "invalid_password");
        }
        assert_eq!(user_repository::count(&conn).unwrap(), 0);
    }

    #[test]
    fn accepts_password_length_boundaries_and_accented_letters() {
        let conn = test_connection();
        let max_length = format!("Aa1!{}", "x".repeat(66));
        for (index, password) in ["Aa1!abcd", max_length.as_str(), "Áé12345!"]
            .iter()
            .enumerate()
        {
            let email = format!("ana{index}@example.com");
            create_user(&conn, registration_payload("Ana", &email, password)).unwrap();
        }
        assert_eq!(user_repository::count(&conn).unwrap(), 3);
    }

    #[test]
    fn rejects_incomplete_and_oversized_registration_phone_numbers() {
        let conn = test_connection();
        for phone in [
            "(75) 99999-999",
            "759999999999",
            "(75) 99999-9999x",
            "(75)  99999-9999",
        ] {
            let mut payload = registration_payload("Ana", "ana@example.com", "Senha-segura-123!");
            payload.phone = phone.into();
            assert_eq!(
                create_user(&conn, payload).unwrap_err().code,
                "invalid_phone"
            );
        }
        assert_eq!(user_repository::count(&conn).unwrap(), 0);
    }

    #[test]
    fn rejects_invalid_and_duplicate_registration() {
        let conn = test_connection();
        assert_eq!(
            create_user(
                &conn,
                registration_payload("A", "ana@example.com", "Senha-segura-123!")
            )
            .unwrap_err()
            .code,
            "invalid_first_name"
        );
        assert_eq!(
            create_user(
                &conn,
                registration_payload("Ana", "email-invalido", "Senha-segura-123!")
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
            registration_payload("Ana", "ana@example.com", "Senha-segura-123!"),
        )
        .unwrap();
        assert_eq!(
            create_user(
                &conn,
                registration_payload("Outra", "ANA@example.com", "Outra-senha-456!")
            )
            .unwrap_err()
            .code,
            "email_in_use"
        );
        assert_eq!(user_repository::count(&conn).unwrap(), 1);
    }

    #[test]
    fn validates_local_user_status_by_external_id() {
        let conn = test_connection();
        let local_user = create_user(
            &conn,
            registration_payload("Carlos", "carlos@example.com", "Senha-12345!"),
        )
        .unwrap();

        assert!(is_local_user(&conn, local_user.id).unwrap());
        assert!(validate_is_local_user(&conn, local_user.id).is_ok());

        // Cria usuário simulado como vindo da plataforma online (com external_id)
        let mut online_payload =
            registration_payload("Mariana", "mariana@example.com", "Senha-12345!");
        online_payload.external_id = Some("ext-platform-999".into());
        let online_user = create_user(&conn, online_payload).unwrap();

        assert!(!is_local_user(&conn, online_user.id).unwrap());
        let validation_err = validate_is_local_user(&conn, online_user.id).unwrap_err();
        assert!(
            validation_err.contains("Online platform users cannot have their data updated locally")
        );
    }

    #[test]
    fn updates_local_user_successfully() {
        let conn = test_connection();
        let user = create_user(
            &conn,
            registration_payload("Lucas", "lucas@example.com", "Senha-12345!"),
        )
        .unwrap();

        let update_payload = UpdateUserPayload {
            id: user.id,
            first_name: "Lucas Gabriel".into(),
            last_name: "Ferreira".into(),
            birth_date: "1992-08-15".into(),
            email: "lucas.ferreira@example.com".into(),
            phone: "(75) 98888-7777".into(),
            photo: Some("data:image/png;base64,samplephoto".into()),
        };

        let updated = update_user(&conn, update_payload).unwrap();
        assert_eq!(updated.first_name, "Lucas Gabriel");
        assert_eq!(updated.last_name, "Ferreira");
        assert_eq!(updated.email, "lucas.ferreira@example.com");
        assert_eq!(updated.phone, "(75) 98888-7777");
        assert_eq!(
            updated.photo,
            Some("data:image/png;base64,samplephoto".into())
        );
    }

    #[test]
    fn blocks_update_for_online_user_with_external_id() {
        let conn = test_connection();
        let mut online_payload =
            registration_payload("Mariana", "mariana@example.com", "Senha-12345!");
        online_payload.external_id = Some("ext-platform-888".into());
        let online_user = create_user(&conn, online_payload).unwrap();

        let update_payload = UpdateUserPayload {
            id: online_user.id,
            first_name: "Mariana Atualizada".into(),
            last_name: "Silva".into(),
            birth_date: "1995-05-20".into(),
            email: "mariana.nova@example.com".into(),
            phone: "(75) 99999-9999".into(),
            photo: None,
        };

        let err = update_user(&conn, update_payload).unwrap_err();
        assert!(err.contains("Online platform users cannot have their data updated locally"));

        // Garante que os dados originais não foram alterados
        let stored = user_repository::find_by_id(&conn, online_user.id)
            .unwrap()
            .unwrap();
        assert_eq!(stored.user.first_name, "Mariana");
        assert_eq!(stored.user.email, "mariana@example.com");
    }
}
