use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::posture_alert::{AlertFilter, CreateAlertPayload, PostureAlert, ResolveAlertPayload};
use crate::repositories::{monitoring_session_repository, posture_alert_repository};

pub fn record_posture_alert(
    conn: &Connection,
    payload: CreateAlertPayload,
) -> Result<PostureAlert, String> {
    if payload.session_id.trim().is_empty() {
        return Err("Session ID cannot be empty".to_string());
    }

    if payload.alert_type.trim().is_empty() {
        return Err("Alert type cannot be empty".to_string());
    }

    if payload.message.trim().is_empty() {
        return Err("Alert message cannot be empty".to_string());
    }

    if let Some(dur) = payload.duration_seconds {
        if dur < 0 {
            return Err("Duration seconds cannot be negative".to_string());
        }
    }

    // Verify monitoring session exists
    let session = monitoring_session_repository::find_by_id(conn, &payload.session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Monitoring session with id '{}' not found", payload.session_id))?;

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let timestamp = payload.timestamp.unwrap_or_else(|| now.clone());
    let severity = payload
        .severity
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "warning".to_string());
    let duration_seconds = payload.duration_seconds.unwrap_or(0);

    let alert = PostureAlert {
        id,
        session_id: session.id.clone(),
        timestamp,
        alert_type: payload.alert_type.trim().to_string(),
        severity,
        duration_seconds,
        message: payload.message.trim().to_string(),
        resolved_at: None,
        created_at: Some(now.clone()),
    };

    posture_alert_repository::insert(conn, &alert).map_err(|e| e.to_string())?;

    // Increment session alerts count
    let _ = monitoring_session_repository::increment_alerts_count(conn, &session.id, &now);

    Ok(alert)
}

pub fn resolve_posture_alert(
    conn: &Connection,
    payload: ResolveAlertPayload,
) -> Result<PostureAlert, String> {
    if payload.id.trim().is_empty() {
        return Err("Alert ID cannot be empty".to_string());
    }

    let existing = posture_alert_repository::find_by_id(conn, &payload.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Posture alert with id '{}' not found", payload.id))?;

    let resolved_at = payload
        .resolved_at
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    posture_alert_repository::resolve_alert(conn, &existing.id, &resolved_at)
        .map_err(|e| e.to_string())?;

    let mut updated = existing;
    updated.resolved_at = Some(resolved_at);

    Ok(updated)
}

pub fn get_alerts_by_session(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<PostureAlert>, String> {
    posture_alert_repository::find_all_by_session_id(conn, session_id).map_err(|e| e.to_string())
}

pub fn get_posture_alerts(
    conn: &Connection,
    filter: AlertFilter,
) -> Result<Vec<PostureAlert>, String> {
    posture_alert_repository::find_alerts(conn, &filter).map_err(|e| e.to_string())
}

pub fn delete_posture_alert(conn: &Connection, id: &str) -> Result<bool, String> {
    let affected = posture_alert_repository::delete(conn, id).map_err(|e| e.to_string())?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::monitoring_session::MonitoringSession;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();

        // Seed user and session
        conn.execute(
            "INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
             VALUES (1, 'Test', 'User', '1990-01-01', 'hash', 'test@test.com', '1234')",
            [],
        )
        .unwrap();

        let session = MonitoringSession {
            id: "test-session-1".to_string(),
            user_id: Some(1),
            started_at: "2026-10-10T10:00:00Z".to_string(),
            ended_at: None,
            duration_seconds: 0,
            average_score: 100.0,
            good_posture_percentage: 100.0,
            warning_posture_percentage: 0.0,
            danger_posture_percentage: 0.0,
            total_alerts_count: 0,
            created_at: Some("2026-10-10T10:00:00Z".to_string()),
            updated_at: Some("2026-10-10T10:00:00Z".to_string()),
        };
        monitoring_session_repository::insert(&conn, &session).unwrap();

        conn
    }

    #[test]
    fn test_record_posture_alert_success() {
        let conn = setup_test_db();
        let payload = CreateAlertPayload {
            session_id: "test-session-1".to_string(),
            timestamp: Some("2026-10-10T10:05:00Z".to_string()),
            alert_type: "neck_forward".to_string(),
            severity: Some("warning".to_string()),
            duration_seconds: Some(25),
            message: "Incline o pescoço para trás".to_string(),
        };

        let alert = record_posture_alert(&conn, payload).unwrap();
        assert_eq!(alert.session_id, "test-session-1");
        assert_eq!(alert.alert_type, "neck_forward");
        assert_eq!(alert.severity, "warning");
        assert_eq!(alert.duration_seconds, 25);
        assert_eq!(alert.message, "Incline o pescoço para trás");
        assert!(alert.resolved_at.is_none());
        assert!(alert.created_at.is_some());

        // Check that session total_alerts_count was incremented
        let session = monitoring_session_repository::find_by_id(&conn, "test-session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.total_alerts_count, 1);
    }

    #[test]
    fn test_record_posture_alert_session_not_found() {
        let conn = setup_test_db();
        let payload = CreateAlertPayload {
            session_id: "non-existent-session".to_string(),
            timestamp: None,
            alert_type: "neck_forward".to_string(),
            severity: None,
            duration_seconds: None,
            message: "Ajuste postura".to_string(),
        };

        let result = record_posture_alert(&conn, payload);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn test_resolve_posture_alert_success() {
        let conn = setup_test_db();
        let payload = CreateAlertPayload {
            session_id: "test-session-1".to_string(),
            timestamp: Some("2026-10-10T10:05:00Z".to_string()),
            alert_type: "shoulder_unbalance".to_string(),
            severity: Some("danger".to_string()),
            duration_seconds: Some(30),
            message: "Alinhe os ombros".to_string(),
        };

        let alert = record_posture_alert(&conn, payload).unwrap();
        assert!(alert.resolved_at.is_none());

        let resolved = resolve_posture_alert(
            &conn,
            ResolveAlertPayload {
                id: alert.id.clone(),
                resolved_at: Some("2026-10-10T10:05:30Z".to_string()),
            },
        )
        .unwrap();

        assert_eq!(resolved.resolved_at, Some("2026-10-10T10:05:30Z".to_string()));

        let fetched = posture_alert_repository::find_by_id(&conn, &alert.id)
            .unwrap()
            .unwrap();
        assert_eq!(fetched.resolved_at, Some("2026-10-10T10:05:30Z".to_string()));
    }

    #[test]
    fn test_get_alerts_filtering() {
        let conn = setup_test_db();

        record_posture_alert(
            &conn,
            CreateAlertPayload {
                session_id: "test-session-1".to_string(),
                timestamp: Some("2026-10-10T10:01:00Z".to_string()),
                alert_type: "neck_forward".to_string(),
                severity: Some("warning".to_string()),
                duration_seconds: Some(20),
                message: "Aviso 1".to_string(),
            },
        )
        .unwrap();

        let alert2 = record_posture_alert(
            &conn,
            CreateAlertPayload {
                session_id: "test-session-1".to_string(),
                timestamp: Some("2026-10-10T10:02:00Z".to_string()),
                alert_type: "screen_too_close".to_string(),
                severity: Some("danger".to_string()),
                duration_seconds: Some(40),
                message: "Aviso 2".to_string(),
            },
        )
        .unwrap();

        // Resolve alert2
        resolve_posture_alert(
            &conn,
            ResolveAlertPayload {
                id: alert2.id,
                resolved_at: None,
            },
        )
        .unwrap();

        // All alerts for session
        let all = get_alerts_by_session(&conn, "test-session-1").unwrap();
        assert_eq!(all.len(), 2);

        // Filter unresolved only
        let unresolved = get_posture_alerts(
            &conn,
            AlertFilter {
                unresolved_only: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(unresolved.len(), 1);
        assert_eq!(unresolved[0].alert_type, "neck_forward");

        // Filter by severity danger
        let danger = get_posture_alerts(
            &conn,
            AlertFilter {
                severity: Some("danger".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(danger.len(), 1);
        assert_eq!(danger[0].alert_type, "screen_too_close");
    }

    #[test]
    fn test_delete_posture_alert() {
        let conn = setup_test_db();
        let alert = record_posture_alert(
            &conn,
            CreateAlertPayload {
                session_id: "test-session-1".to_string(),
                timestamp: None,
                alert_type: "neck_forward".to_string(),
                severity: None,
                duration_seconds: None,
                message: "Aviso".to_string(),
            },
        )
        .unwrap();

        let deleted = delete_posture_alert(&conn, &alert.id).unwrap();
        assert!(deleted);

        let fetched = posture_alert_repository::find_by_id(&conn, &alert.id).unwrap();
        assert!(fetched.is_none());
    }
}
