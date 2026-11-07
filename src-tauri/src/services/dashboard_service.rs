use chrono::DateTime;
use rusqlite::Connection;

use super::auth_service::AuthState;
use crate::models::dashboard::{DashboardData, DashboardFilter};
use crate::repositories::dashboard_repository;

pub fn get_dashboard_data(
    conn: &Connection,
    auth_state: &AuthState,
    filter: DashboardFilter,
) -> Result<DashboardData, String> {
    auth_state.with_authenticated_user(|user_id| {
        let user_id = user_id
            .ok_or_else(|| "Authentication is required to read the dashboard".to_string())?;
        let start = DateTime::parse_from_rfc3339(&filter.start_time)
            .map_err(|_| "Invalid dashboard start time".to_string())?;
        let end = DateTime::parse_from_rfc3339(&filter.end_time)
            .map_err(|_| "Invalid dashboard end time".to_string())?;
        if end <= start {
            return Err("Dashboard end time must follow start time".to_string());
        }
        dashboard_repository::find_period(conn, user_id, &filter.start_time, &filter.end_time)
            .map_err(|error| error.to_string())
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::auth::Session;
    use crate::repositories::user_repository;
    use crate::services::auth_service;

    fn filter() -> DashboardFilter {
        DashboardFilter {
            start_time: "2026-11-03T00:00:00Z".into(),
            end_time: "2026-11-04T00:00:00Z".into(),
        }
    }

    #[test]
    fn requires_authentication_and_uses_the_rust_session_owner() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute_batch("INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
            VALUES (1, 'One', 'User', '', 'hash', 'one@example.com', ''), (2, 'Two', 'User', '', 'hash', 'two@example.com', '');
            INSERT INTO monitoring_sessions (id, user_id, started_at) VALUES ('one', 1, '2026-11-03T12:00:00Z'), ('two', 2, '2026-11-03T12:00:00Z');").unwrap();
        let auth = AuthState::new().unwrap();
        assert!(get_dashboard_data(&conn, &auth, filter()).is_err());
        auth_service::set_session(&auth, Session::Guest).unwrap();
        assert!(get_dashboard_data(&conn, &auth, filter()).is_err());
        for id in [1, 2] {
            let user = user_repository::find_by_id(&conn, id)
                .unwrap()
                .unwrap()
                .user;
            auth_service::set_session(
                &auth,
                Session::Authenticated {
                    user: Box::new(user),
                },
            )
            .unwrap();
            let data = get_dashboard_data(&conn, &auth, filter()).unwrap();
            assert_eq!(data.sessions.len(), 1);
            assert_eq!(data.sessions[0].user_id, Some(id));
            let mut invalid = filter();
            invalid.start_time = "invalid".into();
            assert!(get_dashboard_data(&conn, &auth, invalid).is_err());
            let mut invalid = filter();
            invalid.end_time = invalid.start_time.clone();
            assert!(get_dashboard_data(&conn, &auth, invalid).is_err());
        }
        let override_owner =
            r#"{"startTime":"2026-11-03T00:00:00Z","endTime":"2026-11-04T00:00:00Z","userId":2}"#;
        assert!(serde_json::from_str::<DashboardFilter>(override_owner).is_err());
    }
}
