use rusqlite::{params, Connection};

use super::{
    monitoring_session_repository as sessions, posture_alert_repository as alerts,
    posture_metric_snapshot_repository as snapshots,
};
use crate::models::dashboard::DashboardData;

/// Read each collection separately so joins never multiply session totals or alerts.
pub fn find_period(
    conn: &Connection,
    user_id: &str,
    start: &str,
    end: &str,
) -> Result<DashboardData, rusqlite::Error> {
    let session_sql = format!(
        "SELECT {} FROM monitoring_sessions WHERE user_id = ?1
         AND julianday(started_at) >= julianday(?2) AND julianday(started_at) < julianday(?3)
         ORDER BY julianday(started_at)",
        sessions::SELECT_MONITORING_SESSION_FIELDS
    );
    let sessions = conn
        .prepare(&session_sql)?
        .query_map(
            params![user_id, start, end],
            sessions::map_monitoring_session_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let fields = |columns: &str| {
        columns
            .split(", ")
            .map(|name| format!("p.{}", name))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let snapshot_sql = format!(
        "SELECT {} FROM posture_metrics_snapshots p JOIN monitoring_sessions s ON s.id = p.session_id
         WHERE s.user_id = ?1 AND julianday(p.timestamp) >= julianday(?2)
         AND julianday(p.timestamp) < julianday(?3) ORDER BY julianday(p.timestamp)",
        fields(snapshots::SELECT_POSTURE_METRIC_SNAPSHOT_FIELDS));
    let snapshots = conn
        .prepare(&snapshot_sql)?
        .query_map(
            params![user_id, start, end],
            snapshots::map_posture_metric_snapshot_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let alert_sql = format!(
        "SELECT {} FROM posture_alerts p JOIN monitoring_sessions s ON s.id = p.session_id
         WHERE s.user_id = ?1 AND julianday(p.timestamp) >= julianday(?2)
         AND julianday(p.timestamp) < julianday(?3) ORDER BY julianday(p.timestamp)",
        fields(alerts::SELECT_POSTURE_ALERT_FIELDS)
    );
    let alerts = conn
        .prepare(&alert_sql)?
        .query_map(params![user_id, start, end], alerts::map_posture_alert_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(DashboardData {
        sessions,
        snapshots,
        alerts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
            INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
            VALUES ('00000000-0000-4000-8000-000000000001', 'One', 'User', '', 'hash', 'one@example.com', ''),
                   ('00000000-0000-4000-8000-000000000002', 'Two', 'User', '', 'hash', 'two@example.com', '');
            INSERT INTO monitoring_sessions (id, user_id, started_at) VALUES
              ('one', '00000000-0000-4000-8000-000000000001', '2026-11-03T10:00:00Z'), ('two', '00000000-0000-4000-8000-000000000002', '2026-11-03T10:00:00Z'),
              ('guest', NULL, '2026-11-03T10:00:00Z'), ('old', '00000000-0000-4000-8000-000000000001', '2026-11-02T10:00:00Z');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn scopes_all_collections_and_preserves_null_metrics_and_exclusive_end() {
        let conn = database();
        for session in ["one", "two", "guest", "old"] {
            conn.execute(
                "INSERT INTO posture_metrics_snapshots
                (id, session_id, timestamp, score, samples_count, dominant_status)
                VALUES (?1, ?1, '2026-11-03T12:00:00Z', 80, 600, 'good')",
                [session],
            )
            .unwrap();
            conn.execute("INSERT INTO posture_alerts (id, session_id, timestamp, alert_type, severity, message)
                VALUES (?1, ?1, '2026-11-03T12:00:00Z', 'neck_posture', 'warning', 'test')", [session]).unwrap();
        }
        let data = find_period(
            &conn,
            "00000000-0000-4000-8000-000000000001",
            "2026-11-03T00:00:00-03:00",
            "2026-11-04T00:00:00-03:00",
        )
        .unwrap();
        assert_eq!(data.sessions.len(), 1);
        assert_eq!(data.sessions[0].id, "one");
        // Measurements belong to their own timestamps, even for a session started earlier.
        assert_eq!(data.snapshots.len(), 2);
        assert_eq!(data.alerts.len(), 2);
        assert!(data
            .snapshots
            .iter()
            .all(|item| item.avg_neck_angle.is_none() && item.avg_distance_cm.is_none()));
        let empty = find_period(&conn, "00000000-0000-4000-8000-000000000001", "2026-11-03T13:00:00Z", "2026-11-03T14:00:00Z").unwrap();
        assert!(empty.sessions.is_empty() && empty.snapshots.is_empty() && empty.alerts.is_empty());
        let boundary =
            find_period(&conn, "00000000-0000-4000-8000-000000000001", "2026-11-03T11:00:00Z", "2026-11-03T12:00:00Z").unwrap();
        assert!(boundary.snapshots.is_empty() && boundary.alerts.is_empty());
    }
}
