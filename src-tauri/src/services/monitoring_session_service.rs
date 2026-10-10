use chrono::{DateTime, Utc};
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::monitoring_session::{
    CreateSessionPayload, EndSessionPayload, MonitoringSession, UpdateSessionPayload,
};
use crate::repositories::monitoring_session_repository;

pub fn validate_score(score: f64) -> Result<(), String> {
    if !(0.0..=100.0).contains(&score) {
        return Err("Average score must be between 0 and 100".to_string());
    }
    Ok(())
}

pub fn validate_percentage(name: &str, val: f64) -> Result<(), String> {
    if !(0.0..=100.0).contains(&val) {
        return Err(format!("{} percentage must be between 0 and 100", name));
    }
    Ok(())
}

pub fn start_monitoring_session(
    conn: &Connection,
    payload: Option<CreateSessionPayload>,
) -> Result<MonitoringSession, String> {
    let now = Utc::now().to_rfc3339();
    let payload = payload.unwrap_or_default();

    if let Some(uid) = payload.user_id {
        if uid <= 0 {
            return Err("User ID must be a positive integer".to_string());
        }
    }

    // Auto-close any dangling active session for this user
    if let Ok(Some(mut active)) = monitoring_session_repository::find_active(conn, payload.user_id) {
        active.ended_at = Some(now.clone());
        active.updated_at = Some(now.clone());
        if let (Ok(start), Ok(end)) = (
            DateTime::parse_from_rfc3339(&active.started_at),
            DateTime::parse_from_rfc3339(&now),
        ) {
            let diff = end.signed_duration_since(start).num_seconds();
            if diff > 0 {
                active.duration_seconds = diff;
            }
        }
        let _ = monitoring_session_repository::update(conn, &active);
    }

    let started_at = payload.started_at.unwrap_or_else(|| now.clone());

    let session = MonitoringSession {
        id: Uuid::new_v4().to_string(),
        user_id: payload.user_id,
        started_at,
        ended_at: None,
        duration_seconds: 0,
        average_score: 100.0,
        good_posture_percentage: 100.0,
        warning_posture_percentage: 0.0,
        danger_posture_percentage: 0.0,
        total_alerts_count: 0,
        created_at: Some(now.clone()),
        updated_at: Some(now),
    };

    monitoring_session_repository::insert(conn, &session).map_err(|e| e.to_string())?;

    Ok(session)
}

pub fn end_monitoring_session(
    conn: &Connection,
    payload: EndSessionPayload,
) -> Result<MonitoringSession, String> {
    let mut session = monitoring_session_repository::find_by_id(conn, &payload.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Monitoring session with id '{}' not found", payload.id))?;

    let now = Utc::now().to_rfc3339();
    let ended_at = payload.ended_at.unwrap_or_else(|| now.clone());

    if let Some(dur) = payload.duration_seconds {
        if dur < 0 {
            return Err("Duration seconds cannot be negative".to_string());
        }
        session.duration_seconds = dur;
    } else if let (Ok(start), Ok(end)) = (
        DateTime::parse_from_rfc3339(&session.started_at),
        DateTime::parse_from_rfc3339(&ended_at),
    ) {
        let diff = end.signed_duration_since(start).num_seconds();
        if diff >= 0 {
            session.duration_seconds = diff;
        }
    }

    if let Some(score) = payload.average_score {
        validate_score(score)?;
        session.average_score = score;
    }

    if let Some(good) = payload.good_posture_percentage {
        validate_percentage("Good posture", good)?;
        session.good_posture_percentage = good;
    }

    if let Some(warning) = payload.warning_posture_percentage {
        validate_percentage("Warning posture", warning)?;
        session.warning_posture_percentage = warning;
    }

    if let Some(danger) = payload.danger_posture_percentage {
        validate_percentage("Danger posture", danger)?;
        session.danger_posture_percentage = danger;
    }

    if let Some(alerts_count) = payload.total_alerts_count {
        if alerts_count < 0 {
            return Err("Total alerts count cannot be negative".to_string());
        }
        session.total_alerts_count = alerts_count;
    }

    session.ended_at = Some(ended_at);
    session.updated_at = Some(now);

    monitoring_session_repository::update(conn, &session).map_err(|e| e.to_string())?;

    Ok(session)
}

pub fn update_monitoring_session(
    conn: &Connection,
    payload: UpdateSessionPayload,
) -> Result<MonitoringSession, String> {
    let mut session = monitoring_session_repository::find_by_id(conn, &payload.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Monitoring session with id '{}' not found", payload.id))?;

    let now = Utc::now().to_rfc3339();

    if let Some(ended) = payload.ended_at {
        session.ended_at = Some(ended);
    }

    if let Some(dur) = payload.duration_seconds {
        if dur < 0 {
            return Err("Duration seconds cannot be negative".to_string());
        }
        session.duration_seconds = dur;
    }

    if let Some(score) = payload.average_score {
        validate_score(score)?;
        session.average_score = score;
    }

    if let Some(good) = payload.good_posture_percentage {
        validate_percentage("Good posture", good)?;
        session.good_posture_percentage = good;
    }

    if let Some(warning) = payload.warning_posture_percentage {
        validate_percentage("Warning posture", warning)?;
        session.warning_posture_percentage = warning;
    }

    if let Some(danger) = payload.danger_posture_percentage {
        validate_percentage("Danger posture", danger)?;
        session.danger_posture_percentage = danger;
    }

    if let Some(alerts_count) = payload.total_alerts_count {
        if alerts_count < 0 {
            return Err("Total alerts count cannot be negative".to_string());
        }
        session.total_alerts_count = alerts_count;
    }

    session.updated_at = Some(now);

    monitoring_session_repository::update(conn, &session).map_err(|e| e.to_string())?;

    Ok(session)
}

pub fn get_monitoring_sessions(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<Vec<MonitoringSession>, String> {
    monitoring_session_repository::find_all(conn, user_id).map_err(|e| e.to_string())
}

pub fn get_monitoring_session_by_id(
    conn: &Connection,
    id: &str,
) -> Result<MonitoringSession, String> {
    monitoring_session_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Monitoring session with id '{}' not found", id))
}

pub fn get_active_monitoring_session(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<Option<MonitoringSession>, String> {
    monitoring_session_repository::find_active(conn, user_id).map_err(|e| e.to_string())
}

pub fn delete_monitoring_session(conn: &Connection, id: &str) -> Result<bool, String> {
    let affected = monitoring_session_repository::delete(conn, id).map_err(|e| e.to_string())?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute(
            "INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
             VALUES (1, 'User', 'One', '1990-01-01', 'hash', 'u1@test.com', '1234'),
                    (2, 'User', 'Two', '1990-01-01', 'hash', 'u2@test.com', '1234'),
                    (3, 'User', 'Three', '1990-01-01', 'hash', 'u3@test.com', '1234')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_start_and_get_active_session() {
        let conn = setup_test_db();
        let payload = CreateSessionPayload {
            user_id: Some(1),
            started_at: None,
        };

        let session = start_monitoring_session(&conn, Some(payload)).unwrap();
        assert_eq!(session.user_id, Some(1));
        assert!(session.ended_at.is_none());
        assert_eq!(session.average_score, 100.0);

        let active = get_active_monitoring_session(&conn, Some(1)).unwrap();
        assert!(active.is_some());
        assert_eq!(active.unwrap().id, session.id);
    }

    #[test]
    fn test_starting_new_session_auto_closes_previous() {
        let conn = setup_test_db();
        let session1 = start_monitoring_session(
            &conn,
            Some(CreateSessionPayload {
                user_id: Some(2),
                started_at: None,
            }),
        )
        .unwrap();

        let session2 = start_monitoring_session(
            &conn,
            Some(CreateSessionPayload {
                user_id: Some(2),
                started_at: None,
            }),
        )
        .unwrap();

        assert_ne!(session1.id, session2.id);

        let previous = get_monitoring_session_by_id(&conn, &session1.id).unwrap();
        assert!(previous.ended_at.is_some());

        let active = get_active_monitoring_session(&conn, Some(2)).unwrap();
        assert_eq!(active.unwrap().id, session2.id);
    }

    #[test]
    fn test_end_monitoring_session() {
        let conn = setup_test_db();
        let session = start_monitoring_session(
            &conn,
            Some(CreateSessionPayload {
                user_id: Some(3),
                started_at: Some("2026-10-10T12:00:00Z".to_string()),
            }),
        )
        .unwrap();

        let end_payload = EndSessionPayload {
            id: session.id.clone(),
            ended_at: Some("2026-10-10T12:30:00Z".to_string()),
            duration_seconds: Some(1800),
            average_score: Some(88.5),
            good_posture_percentage: Some(80.0),
            warning_posture_percentage: Some(15.0),
            danger_posture_percentage: Some(5.0),
            total_alerts_count: Some(3),
        };

        let ended = end_monitoring_session(&conn, end_payload).unwrap();
        assert_eq!(ended.duration_seconds, 1800);
        assert_eq!(ended.average_score, 88.5);
        assert_eq!(ended.good_posture_percentage, 80.0);
        assert_eq!(ended.warning_posture_percentage, 15.0);
        assert_eq!(ended.danger_posture_percentage, 5.0);
        assert_eq!(ended.total_alerts_count, 3);
        assert_eq!(ended.ended_at, Some("2026-10-10T12:30:00Z".to_string()));

        let active = get_active_monitoring_session(&conn, Some(3)).unwrap();
        assert!(active.is_none());
    }

    #[test]
    fn test_validations_reject_invalid_values() {
        let conn = setup_test_db();
        let session = start_monitoring_session(&conn, None).unwrap();

        let invalid_score = EndSessionPayload {
            id: session.id.clone(),
            ended_at: None,
            duration_seconds: None,
            average_score: Some(120.0),
            good_posture_percentage: None,
            warning_posture_percentage: None,
            danger_posture_percentage: None,
            total_alerts_count: None,
        };
        assert!(end_monitoring_session(&conn, invalid_score).is_err());

        let invalid_percentage = EndSessionPayload {
            id: session.id.clone(),
            ended_at: None,
            duration_seconds: None,
            average_score: None,
            good_posture_percentage: Some(-10.0),
            warning_posture_percentage: None,
            danger_posture_percentage: None,
            total_alerts_count: None,
        };
        assert!(end_monitoring_session(&conn, invalid_percentage).is_err());

        let invalid_alerts = EndSessionPayload {
            id: session.id.clone(),
            ended_at: None,
            duration_seconds: None,
            average_score: None,
            good_posture_percentage: None,
            warning_posture_percentage: None,
            danger_posture_percentage: None,
            total_alerts_count: Some(-2),
        };
        assert!(end_monitoring_session(&conn, invalid_alerts).is_err());
    }

    #[test]
    fn test_delete_monitoring_session() {
        let conn = setup_test_db();
        let session = start_monitoring_session(&conn, None).unwrap();

        let deleted = delete_monitoring_session(&conn, &session.id).unwrap();
        assert!(deleted);

        let find_result = get_monitoring_session_by_id(&conn, &session.id);
        assert!(find_result.is_err());
    }
}
