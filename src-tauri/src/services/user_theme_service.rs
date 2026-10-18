use rusqlite::Connection;

use crate::models::user_theme::{ThemePreference, UpdateUserThemePayload};
use crate::repositories::user_theme_repository;
use crate::services::auth_service::AuthState;

pub fn get_user_theme_preference(
    conn: &Connection,
    auth_state: &AuthState,
) -> Result<ThemePreference, String> {
    auth_state.with_authenticated_user(|user_id| {
        let user_id = user_id
            .ok_or_else(|| "Authentication is required to manage theme preferences".to_string())?;
        user_theme_repository::find_by_user_id(conn, user_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "User not found".to_string())
    })?
}

pub fn update_user_theme_preference(
    conn: &Connection,
    auth_state: &AuthState,
    payload: UpdateUserThemePayload,
) -> Result<ThemePreference, String> {
    auth_state.with_authenticated_user(|user_id| {
        let user_id = user_id
            .ok_or_else(|| "Authentication is required to manage theme preferences".to_string())?;
        let updated = user_theme_repository::update(conn, user_id, payload.theme)
            .map_err(|error| error.to_string())?;
        if updated == 0 {
            return Err("User not found".to_string());
        }
        Ok(payload.theme)
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::auth::Session;
    use crate::models::user::UpdateUserPayload;
    use crate::repositories::user_repository;
    use crate::services::{auth_service, user_service};

    fn setup_database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn);
        conn
    }

    fn initialize_database(conn: &Connection) {
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    }

    fn create_user(conn: &Connection, email: &str) -> i64 {
        conn.execute(
            "INSERT INTO users (first_name, last_name, birth_date, password_hash, email, phone)
             VALUES ('Test', 'User', '1995-05-20', 'test-hash', ?1, '75999999999')",
            [email],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn authenticate(conn: &Connection, state: &AuthState, user_id: i64) {
        let user = user_repository::find_by_id(conn, user_id)
            .unwrap()
            .unwrap()
            .user;
        auth_service::set_session(
            state,
            Session::Authenticated {
                user: Box::new(user),
            },
        )
        .unwrap();
    }

    fn update_theme(conn: &Connection, state: &AuthState, theme: ThemePreference) {
        assert_eq!(
            update_user_theme_preference(conn, state, UpdateUserThemePayload { theme }).unwrap(),
            theme
        );
    }

    #[test]
    fn new_accounts_default_to_light_and_accept_all_theme_preferences() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = create_user(&conn, "first@example.com");
        authenticate(&conn, &state, user_id);
        assert_eq!(
            get_user_theme_preference(&conn, &state).unwrap(),
            ThemePreference::Light
        );
        for theme in [
            ThemePreference::Dark,
            ThemePreference::System,
            ThemePreference::Light,
        ] {
            update_theme(&conn, &state, theme);
            assert_eq!(get_user_theme_preference(&conn, &state).unwrap(), theme);
            assert_eq!(serde_json::to_value(theme).unwrap(), theme.as_str());
        }
    }

    #[test]
    fn switching_accounts_keeps_each_preference_independent() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let first_id = create_user(&conn, "first@example.com");
        let second_id = create_user(&conn, "second@example.com");
        authenticate(&conn, &state, first_id);
        update_theme(&conn, &state, ThemePreference::Dark);
        auth_service::logout(&state).unwrap();
        authenticate(&conn, &state, second_id);
        assert_eq!(
            get_user_theme_preference(&conn, &state).unwrap(),
            ThemePreference::Light
        );
        update_theme(&conn, &state, ThemePreference::System);
        authenticate(&conn, &state, first_id);
        assert_eq!(
            get_user_theme_preference(&conn, &state).unwrap(),
            ThemePreference::Dark
        );
        authenticate(&conn, &state, second_id);
        assert_eq!(
            get_user_theme_preference(&conn, &state).unwrap(),
            ThemePreference::System
        );
    }

    #[test]
    fn preference_and_profile_edits_do_not_overwrite_each_other() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = create_user(&conn, "first@example.com");
        authenticate(&conn, &state, user_id);
        let before = user_repository::find_by_id(&conn, user_id)
            .unwrap()
            .unwrap();
        update_theme(&conn, &state, ThemePreference::Dark);
        let after = user_repository::find_by_id(&conn, user_id)
            .unwrap()
            .unwrap();
        let mut expected = serde_json::to_value(&before.user).unwrap();
        expected["updatedAt"] = serde_json::to_value(&after.user.updated_at).unwrap();
        assert_eq!(serde_json::to_value(&after.user).unwrap(), expected);
        assert_eq!(after.password_hash, before.password_hash);
        let user = after.user;
        user_service::update_user(
            &conn,
            UpdateUserPayload {
                id: user.id,
                first_name: "Updated".into(),
                last_name: user.last_name,
                birth_date: user.birth_date,
                email: user.email,
                phone: user.phone,
                photo: user.photo,
            },
        )
        .unwrap();
        assert_eq!(
            get_user_theme_preference(&conn, &state).unwrap(),
            ThemePreference::Dark
        );
    }

    #[test]
    fn preferences_survive_reopening_the_database_and_starting_a_new_session() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("themes.db");
        let conn = Connection::open(&path).unwrap();
        initialize_database(&conn);
        let state = AuthState::new().unwrap();
        let first_id = create_user(&conn, "first@example.com");
        let second_id = create_user(&conn, "second@example.com");
        authenticate(&conn, &state, first_id);
        update_theme(&conn, &state, ThemePreference::Dark);
        authenticate(&conn, &state, second_id);
        update_theme(&conn, &state, ThemePreference::System);
        drop(conn);
        drop(state);
        let conn = Connection::open(&path).unwrap();
        let state = AuthState::new().unwrap();
        for (id, expected) in [
            (first_id, ThemePreference::Dark),
            (second_id, ThemePreference::System),
        ] {
            authenticate(&conn, &state, id);
            assert_eq!(get_user_theme_preference(&conn, &state).unwrap(), expected);
        }
    }

    #[test]
    fn anonymous_and_guest_sessions_do_not_read_or_write_account_preferences() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = create_user(&conn, "first@example.com");
        for session in [Session::Anonymous, Session::Guest] {
            auth_service::set_session(&state, session).unwrap();
            assert!(get_user_theme_preference(&conn, &state).is_err());
            assert!(update_user_theme_preference(
                &conn,
                &state,
                UpdateUserThemePayload {
                    theme: ThemePreference::Dark,
                }
            )
            .is_err());
        }
        authenticate(&conn, &state, user_id);
        assert_eq!(
            get_user_theme_preference(&conn, &state).unwrap(),
            ThemePreference::Light
        );
    }

    #[test]
    fn invalid_preferences_and_payloads_with_user_ids_are_rejected() {
        let conn = setup_database();
        let user_id = create_user(&conn, "first@example.com");
        for invalid in ["invalid", "DARK", "", "automatic"] {
            assert!(
                serde_json::from_value::<UpdateUserThemePayload>(serde_json::json!({
                    "theme": invalid,
                }))
                .is_err()
            );
            assert!(conn
                .execute(
                    "UPDATE users SET theme_preference = ?1 WHERE id = ?2",
                    rusqlite::params![invalid, user_id]
                )
                .is_err());
        }
        assert!(conn
            .execute(
                "UPDATE users SET theme_preference = NULL WHERE id = ?1",
                [user_id]
            )
            .is_err());
        assert!(
            serde_json::from_value::<UpdateUserThemePayload>(serde_json::json!({
                "theme": "dark", "userId": user_id,
            }))
            .is_err()
        );
        assert_eq!(
            user_theme_repository::find_by_user_id(&conn, user_id).unwrap(),
            Some(ThemePreference::Light)
        );
    }

    #[test]
    fn deleted_accounts_return_an_error_instead_of_reporting_a_saved_preference() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = create_user(&conn, "first@example.com");
        authenticate(&conn, &state, user_id);
        conn.execute("DELETE FROM users WHERE id = ?1", [user_id])
            .unwrap();
        assert!(get_user_theme_preference(&conn, &state).is_err());
        assert!(update_user_theme_preference(
            &conn,
            &state,
            UpdateUserThemePayload {
                theme: ThemePreference::Dark,
            }
        )
        .is_err());
    }
}
