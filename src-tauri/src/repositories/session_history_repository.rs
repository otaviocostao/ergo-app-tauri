use rusqlite::{params, Connection, OptionalExtension};

use super::{
    monitoring_session_repository as sessions, posture_alert_repository as alerts,
    posture_metric_snapshot_repository as snapshots,
};
use crate::models::{
    monitoring_session::MonitoringSession, posture_alert::PostureAlert,
    posture_metric_snapshot::PostureMetricSnapshot,
};

pub fn find_latest_session(
    conn: &Connection,
    user_id: i64,
) -> rusqlite::Result<Option<MonitoringSession>> {
    let sql = format!(
        "SELECT {} FROM monitoring_sessions WHERE user_id = ?1
        ORDER BY julianday(started_at) DESC, rowid DESC LIMIT 1",
        sessions::SELECT_MONITORING_SESSION_FIELDS
    );
    conn.query_row(&sql, [user_id], sessions::map_monitoring_session_row)
        .optional()
}

pub fn find_window_snapshots(
    conn: &Connection,
    session_id: &str,
    start: &str,
    end: &str,
) -> rusqlite::Result<Vec<PostureMetricSnapshot>> {
    let sql = format!(
        "SELECT {} FROM posture_metrics_snapshots WHERE session_id = ?1
        AND julianday(timestamp) > julianday(?2) AND julianday(timestamp) <= julianday(?3)
        ORDER BY julianday(timestamp), rowid",
        snapshots::SELECT_POSTURE_METRIC_SNAPSHOT_FIELDS
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(
        params![session_id, start, end],
        snapshots::map_posture_metric_snapshot_row,
    )?;
    rows.collect()
}

pub fn find_recent_alerts(
    conn: &Connection,
    session_id: &str,
    end: &str,
) -> rusqlite::Result<Vec<PostureAlert>> {
    let sql = format!(
        "SELECT {} FROM posture_alerts WHERE session_id = ?1
        AND julianday(timestamp) <= julianday(?2)
        ORDER BY julianday(timestamp) DESC, rowid DESC LIMIT 100",
        alerts::SELECT_POSTURE_ALERT_FIELDS
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(params![session_id, end], alerts::map_posture_alert_row)?;
    rows.collect()
}
