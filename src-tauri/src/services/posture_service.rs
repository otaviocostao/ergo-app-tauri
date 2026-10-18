use rusqlite::Connection;

use crate::models::monitoring_session::{
    CreateSessionPayload, EndSessionPayload, MonitoringSession,
};
use crate::models::posture_alert::{
    AlertFilter, CreateAlertPayload, PostureAlert, ResolveAlertPayload,
};
use crate::models::posture_calibration::{PostureCalibration, SaveCalibrationPayload};
use crate::models::posture_metric_snapshot::{
    CreateSnapshotPayload, PostureMetricSnapshot, SnapshotHistoryFilter,
};
use crate::services::{
    monitoring_session_service, posture_alert_service, posture_calibration_service,
    posture_metric_snapshot_service,
};

// Monitoring session operations
pub fn start_monitoring_session(
    conn: &Connection,
    payload: Option<CreateSessionPayload>,
) -> Result<MonitoringSession, String> {
    monitoring_session_service::start_monitoring_session(conn, payload)
}

pub fn end_monitoring_session(
    conn: &Connection,
    payload: EndSessionPayload,
) -> Result<MonitoringSession, String> {
    monitoring_session_service::end_monitoring_session(conn, payload)
}

// Metric snapshots operations
pub fn record_metric_snapshot(
    conn: &Connection,
    payload: CreateSnapshotPayload,
) -> Result<PostureMetricSnapshot, String> {
    posture_metric_snapshot_service::record_metric_snapshot(conn, payload)
}

pub fn get_posture_history(
    conn: &Connection,
    filter: SnapshotHistoryFilter,
) -> Result<Vec<PostureMetricSnapshot>, String> {
    posture_metric_snapshot_service::get_posture_history(conn, filter)
}

// Posture alerts operations
pub fn record_posture_alert(
    conn: &Connection,
    payload: CreateAlertPayload,
) -> Result<PostureAlert, String> {
    posture_alert_service::record_posture_alert(conn, payload)
}

pub fn resolve_posture_alert(
    conn: &Connection,
    payload: ResolveAlertPayload,
) -> Result<PostureAlert, String> {
    posture_alert_service::resolve_posture_alert(conn, payload)
}

pub fn get_posture_alerts(
    conn: &Connection,
    filter: AlertFilter,
) -> Result<Vec<PostureAlert>, String> {
    posture_alert_service::get_posture_alerts(conn, filter)
}

// Calibration operations
pub fn save_posture_calibration(
    conn: &Connection,
    payload: SaveCalibrationPayload,
) -> Result<PostureCalibration, String> {
    posture_calibration_service::save_posture_calibration(conn, payload)
}

pub fn get_active_calibration(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<Option<PostureCalibration>, String> {
    posture_calibration_service::get_active_calibration(conn, user_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::posture_metric_snapshot::PostureStatus;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();

        conn.execute(
            "INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
             VALUES (1, 'Test', 'User', '1990-01-01', 'hash', 'test@test.com', '1234')",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_posture_service_flow() {
        let conn = setup_test_db();

        // 1. Save calibration
        let cal = save_posture_calibration(
            &conn,
            SaveCalibrationPayload {
                user_id: Some(1),
                baseline_neck_angle: 15.0,
                baseline_shoulder_balance: 0.98,
                baseline_distance_cm: 60.0,
                baseline_eye_distance_px: 120.0,
                is_active: Some(true),
            },
        )
        .unwrap();
        assert!(cal.is_active);

        // 2. Start monitoring session
        let session = start_monitoring_session(
            &conn,
            Some(CreateSessionPayload {
                user_id: Some(1),
                started_at: Some("2026-10-10T10:00:00Z".to_string()),
            }),
        )
        .unwrap();
        assert_eq!(session.duration_seconds, 0);

        // 3. Record snapshot
        let snap = record_metric_snapshot(
            &conn,
            CreateSnapshotPayload {
                session_id: session.id.clone(),
                timestamp: Some("2026-10-10T10:01:00Z".to_string()),
                avg_neck_angle: 15.2,
                max_neck_angle: 18.0,
                avg_shoulder_balance: 0.97,
                min_shoulder_balance: 0.94,
                avg_distance_cm: 59.5,
                blink_count: 15,
                dominant_status: PostureStatus::Good,
                score: 95.0,
                samples_count: 600,
            },
        )
        .unwrap();
        assert_eq!(snap.score, 95.0);

        // 4. Record alert
        let alert = record_posture_alert(
            &conn,
            CreateAlertPayload {
                session_id: session.id.clone(),
                timestamp: Some("2026-10-10T10:02:00Z".to_string()),
                alert_type: "neck_forward".to_string(),
                severity: Some("warning".to_string()),
                duration_seconds: Some(22),
                message: "Pescoço inclinado".to_string(),
            },
        )
        .unwrap();
        assert_eq!(alert.duration_seconds, 22);

        // 5. Query history
        let history = get_posture_history(
            &conn,
            SnapshotHistoryFilter {
                session_id: Some(session.id.clone()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(history.len(), 1);

        // 6. End session
        let ended = end_monitoring_session(
            &conn,
            EndSessionPayload {
                id: session.id.clone(),
                ended_at: Some("2026-10-10T10:30:00Z".to_string()),
                duration_seconds: Some(1800),
                average_score: Some(92.0),
                good_posture_percentage: Some(85.0),
                warning_posture_percentage: Some(15.0),
                danger_posture_percentage: Some(0.0),
                total_alerts_count: Some(1),
            },
        )
        .unwrap();
        assert_eq!(ended.duration_seconds, 1800);
        assert!(ended.ended_at.is_some());
    }
}
