use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::posture_metric_snapshot::{
    CreateSnapshotPayload, PostureMetricSnapshot, SnapshotHistoryFilter,
};
use crate::repositories::{monitoring_session_repository, posture_metric_snapshot_repository};

pub fn validate_snapshot_payload(
    conn: &Connection,
    payload: &CreateSnapshotPayload,
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

    if !(0.0..=100.0).contains(&payload.score) {
        return Err("Score must be between 0 and 100".to_string());
    }

    if payload.blink_count < 0 {
        return Err("Blink count cannot be negative".to_string());
    }

    if payload.samples_count < 0 {
        return Err("Samples count cannot be negative".to_string());
    }

    if !payload.avg_neck_angle.is_finite()
        || !payload.max_neck_angle.is_finite()
        || !payload.avg_shoulder_balance.is_finite()
        || !payload.min_shoulder_balance.is_finite()
        || !payload.avg_distance_cm.is_finite()
    {
        return Err("Metric angle and distance values must be valid numbers".to_string());
    }

    Ok(())
}

pub fn record_metric_snapshot(
    conn: &Connection,
    payload: CreateSnapshotPayload,
) -> Result<PostureMetricSnapshot, String> {
    validate_snapshot_payload(conn, &payload)?;

    let now = Utc::now().to_rfc3339();
    let timestamp = payload.timestamp.unwrap_or_else(|| now.clone());

    let snapshot = PostureMetricSnapshot {
        id: Uuid::new_v4().to_string(),
        session_id: payload.session_id,
        timestamp,
        avg_neck_angle: payload.avg_neck_angle,
        max_neck_angle: payload.max_neck_angle,
        avg_shoulder_balance: payload.avg_shoulder_balance,
        min_shoulder_balance: payload.min_shoulder_balance,
        avg_distance_cm: payload.avg_distance_cm,
        blink_count: payload.blink_count,
        dominant_status: payload.dominant_status,
        score: payload.score,
        samples_count: payload.samples_count,
        created_at: Some(now),
    };

    posture_metric_snapshot_repository::insert(conn, &snapshot).map_err(|e| e.to_string())?;

    Ok(snapshot)
}

pub fn record_metric_snapshots_batch(
    conn: &Connection,
    payloads: Vec<CreateSnapshotPayload>,
) -> Result<Vec<PostureMetricSnapshot>, String> {
    if payloads.is_empty() {
        return Ok(Vec::new());
    }

    let mut snapshots = Vec::with_capacity(payloads.len());
    let now = Utc::now().to_rfc3339();

    for payload in payloads {
        validate_snapshot_payload(conn, &payload)?;
        let timestamp = payload.timestamp.unwrap_or_else(|| now.clone());

        snapshots.push(PostureMetricSnapshot {
            id: Uuid::new_v4().to_string(),
            session_id: payload.session_id,
            timestamp,
            avg_neck_angle: payload.avg_neck_angle,
            max_neck_angle: payload.max_neck_angle,
            avg_shoulder_balance: payload.avg_shoulder_balance,
            min_shoulder_balance: payload.min_shoulder_balance,
            avg_distance_cm: payload.avg_distance_cm,
            blink_count: payload.blink_count,
            dominant_status: payload.dominant_status,
            score: payload.score,
            samples_count: payload.samples_count,
            created_at: Some(now.clone()),
        });
    }

    posture_metric_snapshot_repository::insert_batch(conn, &snapshots)
        .map_err(|e| e.to_string())?;

    Ok(snapshots)
}

pub fn get_snapshots_by_session(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<PostureMetricSnapshot>, String> {
    posture_metric_snapshot_repository::find_all_by_session_id(conn, session_id)
        .map_err(|e| e.to_string())
}

pub fn get_posture_history(
    conn: &Connection,
    filter: SnapshotHistoryFilter,
) -> Result<Vec<PostureMetricSnapshot>, String> {
    posture_metric_snapshot_repository::find_history(conn, &filter).map_err(|e| e.to_string())
}

pub fn delete_metric_snapshot(conn: &Connection, id: &str) -> Result<bool, String> {
    let affected =
        posture_metric_snapshot_repository::delete(conn, id).map_err(|e| e.to_string())?;
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

        // Seed a user and an active monitoring session
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
    fn test_record_single_snapshot_success() {
        let conn = setup_test_db();
        let payload = CreateSnapshotPayload {
            session_id: "test-session-1".to_string(),
            timestamp: Some("2026-10-10T10:01:00Z".to_string()),
            avg_neck_angle: 14.5,
            max_neck_angle: 22.0,
            avg_shoulder_balance: 0.96,
            min_shoulder_balance: 0.90,
            avg_distance_cm: 58.0,
            blink_count: 18,
            dominant_status: PostureStatus::Good,
            score: 95.0,
            samples_count: 600,
        };

        let snapshot = record_metric_snapshot(&conn, payload).unwrap();
        assert_eq!(snapshot.session_id, "test-session-1");
        assert_eq!(snapshot.timestamp, "2026-10-10T10:01:00Z");
        assert_eq!(snapshot.dominant_status, PostureStatus::Good);
        assert_eq!(snapshot.dominant_status.as_str(), "good");
        assert_eq!(snapshot.score, 95.0);
        assert_eq!(snapshot.blink_count, 18);
        assert_eq!(snapshot.samples_count, 600);
        assert!(snapshot.created_at.is_some());

        let snapshots = get_snapshots_by_session(&conn, "test-session-1").unwrap();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].id, snapshot.id);
        assert_eq!(snapshots[0].dominant_status, PostureStatus::Good);
    }

    #[test]
    fn test_record_batch_snapshots_success() {
        let conn = setup_test_db();
        let payloads = vec![
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: Some("2026-10-10T10:01:00Z".to_string()),
                avg_neck_angle: 12.0,
                max_neck_angle: 15.0,
                avg_shoulder_balance: 0.98,
                min_shoulder_balance: 0.95,
                avg_distance_cm: 60.0,
                blink_count: 20,
                dominant_status: PostureStatus::Good,
                score: 98.0,
                samples_count: 600,
            },
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: Some("2026-10-10T10:02:00Z".to_string()),
                avg_neck_angle: 25.0,
                max_neck_angle: 32.0,
                avg_shoulder_balance: 0.85,
                min_shoulder_balance: 0.80,
                avg_distance_cm: 45.0,
                blink_count: 12,
                dominant_status: PostureStatus::Warning,
                score: 75.0,
                samples_count: 600,
            },
        ];

        let created = record_metric_snapshots_batch(&conn, payloads).unwrap();
        assert_eq!(created.len(), 2);

        let history = get_snapshots_by_session(&conn, "test-session-1").unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].score, 98.0);
        assert_eq!(history[0].dominant_status, PostureStatus::Good);
        assert_eq!(history[1].score, 75.0);
        assert_eq!(history[1].dominant_status, PostureStatus::Warning);
    }

    #[test]
    fn test_filter_history_queries() {
        let conn = setup_test_db();
        let payloads = vec![
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: Some("2026-10-10T10:01:00Z".to_string()),
                avg_neck_angle: 10.0,
                max_neck_angle: 12.0,
                avg_shoulder_balance: 0.99,
                min_shoulder_balance: 0.95,
                avg_distance_cm: 60.0,
                blink_count: 18,
                dominant_status: PostureStatus::Good,
                score: 95.0,
                samples_count: 600,
            },
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: Some("2026-10-10T10:05:00Z".to_string()),
                avg_neck_angle: 15.0,
                max_neck_angle: 20.0,
                avg_shoulder_balance: 0.95,
                min_shoulder_balance: 0.90,
                avg_distance_cm: 58.0,
                blink_count: 15,
                dominant_status: PostureStatus::Good,
                score: 90.0,
                samples_count: 600,
            },
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: Some("2026-10-10T10:10:00Z".to_string()),
                avg_neck_angle: 30.0,
                max_neck_angle: 35.0,
                avg_shoulder_balance: 0.70,
                min_shoulder_balance: 0.65,
                avg_distance_cm: 40.0,
                blink_count: 8,
                dominant_status: PostureStatus::Danger,
                score: 50.0,
                samples_count: 600,
            },
        ];
        record_metric_snapshots_batch(&conn, payloads).unwrap();

        // Filter by date range
        let filtered = get_posture_history(
            &conn,
            SnapshotHistoryFilter {
                session_id: Some("test-session-1".to_string()),
                start_time: Some("2026-10-10T10:02:00Z".to_string()),
                end_time: Some("2026-10-10T10:08:00Z".to_string()),
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].timestamp, "2026-10-10T10:05:00Z");
        assert_eq!(filtered[0].dominant_status, PostureStatus::Good);

        // Filter with limit
        let limited = get_posture_history(
            &conn,
            SnapshotHistoryFilter {
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
    fn test_validations_reject_invalid_inputs() {
        let conn = setup_test_db();

        // Non-existent session
        let err = record_metric_snapshot(
            &conn,
            CreateSnapshotPayload {
                session_id: "non-existent-session".to_string(),
                timestamp: None,
                avg_neck_angle: 10.0,
                max_neck_angle: 15.0,
                avg_shoulder_balance: 0.9,
                min_shoulder_balance: 0.8,
                avg_distance_cm: 60.0,
                blink_count: 10,
                dominant_status: PostureStatus::Good,
                score: 90.0,
                samples_count: 600,
            },
        )
        .unwrap_err();
        assert!(err.contains("not found"));

        // Invalid score
        let err = record_metric_snapshot(
            &conn,
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: None,
                avg_neck_angle: 10.0,
                max_neck_angle: 15.0,
                avg_shoulder_balance: 0.9,
                min_shoulder_balance: 0.8,
                avg_distance_cm: 60.0,
                blink_count: 10,
                dominant_status: PostureStatus::Good,
                score: 120.0,
                samples_count: 600,
            },
        )
        .unwrap_err();
        assert!(err.contains("Score must be between 0 and 100"));

        // Invalid status deserialization via serde
        let invalid_json = r#"{"sessionId":"test-session-1","avgNeckAngle":10.0,"maxNeckAngle":15.0,"avgShoulderBalance":0.9,"minShoulderBalance":0.8,"avgDistanceCm":60.0,"blinkCount":10,"dominantStatus":"invalid_status","score":80.0,"samplesCount":600}"#;
        let res: Result<CreateSnapshotPayload, _> = serde_json::from_str(invalid_json);
        assert!(res.is_err());

        // Negative blink count
        let err = record_metric_snapshot(
            &conn,
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: None,
                avg_neck_angle: 10.0,
                max_neck_angle: 15.0,
                avg_shoulder_balance: 0.9,
                min_shoulder_balance: 0.8,
                avg_distance_cm: 60.0,
                blink_count: -1,
                dominant_status: PostureStatus::Good,
                score: 80.0,
                samples_count: 600,
            },
        )
        .unwrap_err();
        assert!(err.contains("Blink count cannot be negative"));
    }

    #[test]
    fn test_delete_metric_snapshot() {
        let conn = setup_test_db();
        let snapshot = record_metric_snapshot(
            &conn,
            CreateSnapshotPayload {
                session_id: "test-session-1".to_string(),
                timestamp: None,
                avg_neck_angle: 10.0,
                max_neck_angle: 15.0,
                avg_shoulder_balance: 0.9,
                min_shoulder_balance: 0.8,
                avg_distance_cm: 60.0,
                blink_count: 10,
                dominant_status: PostureStatus::Good,
                score: 90.0,
                samples_count: 600,
            },
        )
        .unwrap();

        let deleted = delete_metric_snapshot(&conn, &snapshot.id).unwrap();
        assert!(deleted);

        let list = get_snapshots_by_session(&conn, "test-session-1").unwrap();
        assert!(list.is_empty());
    }
}
