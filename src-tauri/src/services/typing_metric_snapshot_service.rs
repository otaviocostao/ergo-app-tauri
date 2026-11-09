use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::typing_metric_snapshot::{
    CreateTypingSnapshotPayload, TypingMetricSnapshot, TypingSnapshotHistoryFilter,
};
use crate::repositories::{monitoring_session_repository, typing_metric_snapshot_repository};

pub fn validate_typing_snapshot_payload(
    conn: &Connection,
    payload: &CreateTypingSnapshotPayload,
) -> Result<(), String> {
    if payload.session_id.trim().is_empty() {
        return Err("Session ID cannot be empty".to_string());
    }

    let session = monitoring_session_repository::find_by_id(conn, &payload.session_id)
        .map_err(|e| e.to_string())?;
    if session.is_none() {
        return Err(format!(
            "Monitoring session with id '{}' not found",
            payload.session_id
        ));
    }

    if payload.window_duration_seconds <= 0 {
        return Err("Window duration must be greater than zero".to_string());
    }

    if payload.keystrokes_count < 0 {
        return Err("Keystrokes count cannot be negative".to_string());
    }

    if payload.active_typing_seconds < 0
        || payload.active_typing_seconds > payload.window_duration_seconds
    {
        return Err("Active typing seconds must be between 0 and window duration".to_string());
    }

    if payload.micro_pauses_count < 0 {
        return Err("Micro pauses count cannot be negative".to_string());
    }

    if payload.continuous_typing_minutes < 0 {
        return Err("Continuous typing minutes cannot be negative".to_string());
    }

    if !payload.cadence_cpm.is_finite() || payload.cadence_cpm < 0.0 {
        return Err("Cadence CPM must be a finite non-negative number".to_string());
    }

    if !payload.peak_cpm.is_finite() || payload.peak_cpm < 0.0 {
        return Err("Peak CPM must be a finite non-negative number".to_string());
    }

    Ok(())
}

pub fn record_typing_snapshot(
    conn: &Connection,
    payload: CreateTypingSnapshotPayload,
) -> Result<TypingMetricSnapshot, String> {
    validate_typing_snapshot_payload(conn, &payload)?;

    let now = Utc::now().to_rfc3339();
    let timestamp = payload
        .timestamp
        .filter(|ts| !ts.trim().is_empty())
        .unwrap_or_else(|| now.clone());

    let snapshot = TypingMetricSnapshot {
        id: Uuid::new_v4().to_string(),
        session_id: payload.session_id,
        timestamp,
        window_duration_seconds: payload.window_duration_seconds,
        keystrokes_count: payload.keystrokes_count,
        cadence_cpm: payload.cadence_cpm,
        peak_cpm: payload.peak_cpm,
        active_typing_seconds: payload.active_typing_seconds,
        micro_pauses_count: payload.micro_pauses_count,
        continuous_typing_minutes: payload.continuous_typing_minutes,
        dominant_status: payload.dominant_status,
        created_at: Some(now),
    };

    typing_metric_snapshot_repository::insert(conn, &snapshot).map_err(|e| e.to_string())?;

    Ok(snapshot)
}

pub fn record_typing_snapshots_batch(
    conn: &Connection,
    payloads: Vec<CreateTypingSnapshotPayload>,
) -> Result<Vec<TypingMetricSnapshot>, String> {
    if payloads.is_empty() {
        return Ok(Vec::new());
    }

    let mut snapshots = Vec::with_capacity(payloads.len());
    let now = Utc::now().to_rfc3339();

    for payload in payloads {
        validate_typing_snapshot_payload(conn, &payload)?;
        let timestamp = payload
            .timestamp
            .filter(|ts| !ts.trim().is_empty())
            .unwrap_or_else(|| now.clone());

        snapshots.push(TypingMetricSnapshot {
            id: Uuid::new_v4().to_string(),
            session_id: payload.session_id,
            timestamp,
            window_duration_seconds: payload.window_duration_seconds,
            keystrokes_count: payload.keystrokes_count,
            cadence_cpm: payload.cadence_cpm,
            peak_cpm: payload.peak_cpm,
            active_typing_seconds: payload.active_typing_seconds,
            micro_pauses_count: payload.micro_pauses_count,
            continuous_typing_minutes: payload.continuous_typing_minutes,
            dominant_status: payload.dominant_status,
            created_at: Some(now.clone()),
        });
    }

    typing_metric_snapshot_repository::insert_batch(conn, &snapshots).map_err(|e| e.to_string())?;

    Ok(snapshots)
}

pub fn get_typing_snapshots_by_session(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<TypingMetricSnapshot>, String> {
    typing_metric_snapshot_repository::find_all_by_session_id(conn, session_id)
        .map_err(|e| e.to_string())
}

pub fn get_typing_history(
    conn: &Connection,
    filter: TypingSnapshotHistoryFilter,
) -> Result<Vec<TypingMetricSnapshot>, String> {
    typing_metric_snapshot_repository::find_history(conn, &filter).map_err(|e| e.to_string())
}

pub fn delete_typing_snapshot(conn: &Connection, id: &str) -> Result<bool, String> {
    let affected =
        typing_metric_snapshot_repository::delete(conn, id).map_err(|e| e.to_string())?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::monitoring_session::MonitoringSession;
    use crate::models::typing_metric_snapshot::TypingStatus;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();

        conn.execute(
            "INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
             VALUES ('00000000-0000-4000-8000-000000000001', 'Test', 'User', '1990-01-01', 'hash', 'test@test.com', '1234')",
            [],
        )
        .unwrap();

        let session = MonitoringSession {
            id: "test-session-1".to_string(),
            user_id: Some("00000000-0000-4000-8000-000000000001".into()),
            started_at: "2026-11-04T10:00:00Z".to_string(),
            ended_at: None,
            duration_seconds: 0,
            average_score: 100.0,
            good_posture_percentage: 100.0,
            warning_posture_percentage: 0.0,
            danger_posture_percentage: 0.0,
            total_alerts_count: 0,
            created_at: Some("2026-11-04T10:00:00Z".to_string()),
            updated_at: Some("2026-11-04T10:00:00Z".to_string()),
        };
        monitoring_session_repository::insert(&conn, &session).unwrap();

        conn
    }

    fn valid_payload() -> CreateTypingSnapshotPayload {
        CreateTypingSnapshotPayload {
            session_id: "test-session-1".to_string(),
            timestamp: Some("2026-11-04T10:01:00Z".to_string()),
            window_duration_seconds: 60,
            keystrokes_count: 195,
            cadence_cpm: 195.0,
            peak_cpm: 252.0,
            active_typing_seconds: 48,
            micro_pauses_count: 2,
            continuous_typing_minutes: 4,
            dominant_status: TypingStatus::Good,
        }
    }

    #[test]
    fn test_record_single_typing_snapshot_success() {
        let conn = setup_test_db();
        let payload = valid_payload();

        let snapshot = record_typing_snapshot(&conn, payload).unwrap();
        assert!(!snapshot.id.is_empty());
        assert_eq!(snapshot.session_id, "test-session-1");
        assert_eq!(snapshot.timestamp, "2026-11-04T10:01:00Z");
        assert_eq!(snapshot.window_duration_seconds, 60);
        assert_eq!(snapshot.keystrokes_count, 195);
        assert_eq!(snapshot.cadence_cpm, 195.0);
        assert_eq!(snapshot.peak_cpm, 252.0);
        assert_eq!(snapshot.active_typing_seconds, 48);
        assert_eq!(snapshot.micro_pauses_count, 2);
        assert_eq!(snapshot.continuous_typing_minutes, 4);
        assert_eq!(snapshot.dominant_status, TypingStatus::Good);
        assert!(snapshot.created_at.is_some());

        let snapshots = get_typing_snapshots_by_session(&conn, "test-session-1").unwrap();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0], snapshot);
    }

    #[test]
    fn test_record_batch_typing_snapshots_and_empty_batch() {
        let conn = setup_test_db();
        assert!(record_typing_snapshots_batch(&conn, vec![])
            .unwrap()
            .is_empty());

        let payloads = vec![
            CreateTypingSnapshotPayload {
                timestamp: Some("2026-11-04T10:01:00Z".to_string()),
                keystrokes_count: 180,
                cadence_cpm: 180.0,
                dominant_status: TypingStatus::Good,
                ..valid_payload()
            },
            CreateTypingSnapshotPayload {
                timestamp: Some("2026-11-04T10:02:00Z".to_string()),
                keystrokes_count: 240,
                cadence_cpm: 240.0,
                continuous_typing_minutes: 16,
                dominant_status: TypingStatus::Warning,
                ..valid_payload()
            },
        ];

        let created = record_typing_snapshots_batch(&conn, payloads).unwrap();
        assert_eq!(created.len(), 2);

        let stored = get_typing_snapshots_by_session(&conn, "test-session-1").unwrap();
        assert_eq!(stored.len(), 2);
        assert_eq!(stored[0].dominant_status, TypingStatus::Good);
        assert_eq!(stored[1].dominant_status, TypingStatus::Warning);
    }

    #[test]
    fn test_validations_reject_invalid_inputs() {
        let conn = setup_test_db();

        // Empty session_id
        let err = record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                session_id: "   ".to_string(),
                ..valid_payload()
            },
        )
        .unwrap_err();
        assert!(err.contains("Session ID cannot be empty"));

        // Non-existent session_id
        let err = record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                session_id: "missing-session".to_string(),
                ..valid_payload()
            },
        )
        .unwrap_err();
        assert!(err.contains("not found"));

        // Non-positive window_duration_seconds
        let err = record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                window_duration_seconds: 0,
                active_typing_seconds: 0,
                ..valid_payload()
            },
        )
        .unwrap_err();
        assert!(err.contains("Window duration must be greater than zero"));

        // Negative keystrokes_count
        let err = record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                keystrokes_count: -1,
                ..valid_payload()
            },
        )
        .unwrap_err();
        assert!(err.contains("Keystrokes count cannot be negative"));

        // active_typing_seconds negative or exceeding window_duration_seconds
        let err = record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                active_typing_seconds: -1,
                ..valid_payload()
            },
        )
        .unwrap_err();
        assert!(err.contains("Active typing seconds must be between 0 and window duration"));

        let err = record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                window_duration_seconds: 60,
                active_typing_seconds: 61,
                ..valid_payload()
            },
        )
        .unwrap_err();
        assert!(err.contains("Active typing seconds must be between 0 and window duration"));

        // Negative micro_pauses_count and continuous_typing_minutes
        assert!(record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                micro_pauses_count: -1,
                ..valid_payload()
            },
        )
        .is_err());

        assert!(record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                continuous_typing_minutes: -1,
                ..valid_payload()
            },
        )
        .is_err());

        // Non-finite or negative cadence_cpm and peak_cpm
        for bad_value in [-0.1, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(record_typing_snapshot(
                &conn,
                CreateTypingSnapshotPayload {
                    cadence_cpm: bad_value,
                    ..valid_payload()
                },
            )
            .is_err());

            assert!(record_typing_snapshot(
                &conn,
                CreateTypingSnapshotPayload {
                    peak_cpm: bad_value,
                    ..valid_payload()
                },
            )
            .is_err());
        }
    }

    #[test]
    fn test_filter_typing_history_queries() {
        let conn = setup_test_db();
        let payloads = vec![
            CreateTypingSnapshotPayload {
                timestamp: Some("2026-11-04T10:01:00Z".to_string()),
                keystrokes_count: 150,
                cadence_cpm: 150.0,
                ..valid_payload()
            },
            CreateTypingSnapshotPayload {
                timestamp: Some("2026-11-04T10:05:00Z".to_string()),
                keystrokes_count: 200,
                cadence_cpm: 200.0,
                ..valid_payload()
            },
            CreateTypingSnapshotPayload {
                timestamp: Some("2026-11-04T10:10:00Z".to_string()),
                keystrokes_count: 250,
                cadence_cpm: 250.0,
                continuous_typing_minutes: 25,
                dominant_status: TypingStatus::Danger,
                ..valid_payload()
            },
        ];
        record_typing_snapshots_batch(&conn, payloads).unwrap();

        let filtered = get_typing_history(
            &conn,
            TypingSnapshotHistoryFilter {
                session_id: Some("test-session-1".to_string()),
                start_time: Some("2026-11-04T10:02:00Z".to_string()),
                end_time: Some("2026-11-04T10:08:00Z".to_string()),
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].timestamp, "2026-11-04T10:05:00Z");
        assert_eq!(filtered[0].keystrokes_count, 200);

        let limited = get_typing_history(
            &conn,
            TypingSnapshotHistoryFilter {
                session_id: Some("test-session-1".to_string()),
                start_time: None,
                end_time: None,
                limit: Some(2),
            },
        )
        .unwrap();
        assert_eq!(limited.len(), 2);
    }

    #[test]
    fn test_delete_snapshot_and_cascade_on_session_removal() {
        let conn = setup_test_db();
        let snap_1 = record_typing_snapshot(&conn, valid_payload()).unwrap();
        let _snap_2 = record_typing_snapshot(
            &conn,
            CreateTypingSnapshotPayload {
                timestamp: None,
                ..valid_payload()
            },
        )
        .unwrap();

        assert!(delete_typing_snapshot(&conn, &snap_1.id).unwrap());
        assert!(!delete_typing_snapshot(&conn, &snap_1.id).unwrap());
        assert_eq!(
            get_typing_snapshots_by_session(&conn, "test-session-1")
                .unwrap()
                .len(),
            1
        );

        monitoring_session_repository::delete(&conn, "test-session-1").unwrap();
        assert!(get_typing_snapshots_by_session(&conn, "test-session-1")
            .unwrap()
            .is_empty());
    }
}

