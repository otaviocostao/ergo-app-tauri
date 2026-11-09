use rusqlite::{params, Connection};

use super::{
    monitoring_session_repository as sessions, posture_alert_repository as alerts,
    posture_metric_snapshot_repository as posture, typing_metric_snapshot_repository as typing,
};
use crate::models::report::ReportData;

fn qualified_fields(columns: &str) -> String {
    columns
        .split(", ")
        .map(|name| format!("p.{name}"))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Read independent collections so joining summaries never multiplies totals.
pub fn find_period(
    conn: &Connection,
    user_id: &str,
    start: &str,
    end: &str,
) -> Result<ReportData, rusqlite::Error> {
    let session_sql = format!(
        "SELECT {} FROM monitoring_sessions WHERE user_id = ?1
         AND julianday(started_at) < julianday(?3)
         AND (ended_at IS NULL OR julianday(ended_at) > julianday(?2))
         ORDER BY julianday(started_at), id",
        sessions::SELECT_MONITORING_SESSION_FIELDS
    );
    let sessions = conn
        .prepare(&session_sql)?
        .query_map(
            params![user_id, start, end],
            sessions::map_monitoring_session_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;

    // Each saved summary belongs to its recording timestamp, even when the
    // session began before the selected period. End bounds are exclusive.
    let collection_sql = |table: &str, columns: &str| {
        format!(
            "SELECT {} FROM {table} p JOIN monitoring_sessions s ON s.id = p.session_id
             WHERE s.user_id = ?1 AND julianday(p.timestamp) >= julianday(?2)
             AND julianday(p.timestamp) < julianday(?3)
             ORDER BY julianday(p.timestamp), p.id",
            qualified_fields(columns)
        )
    };
    let posture_snapshots = conn
        .prepare(&collection_sql(
            "posture_metrics_snapshots",
            posture::SELECT_POSTURE_METRIC_SNAPSHOT_FIELDS,
        ))?
        .query_map(
            params![user_id, start, end],
            posture::map_posture_metric_snapshot_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let typing_snapshots = conn
        .prepare(&collection_sql(
            "typing_metrics_snapshots",
            typing::SELECT_TYPING_SNAPSHOT_FIELDS,
        ))?
        .query_map(
            params![user_id, start, end],
            typing::map_typing_snapshot_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let alerts = conn
        .prepare(&collection_sql(
            "posture_alerts",
            alerts::SELECT_POSTURE_ALERT_FIELDS,
        ))?
        .query_map(params![user_id, start, end], alerts::map_posture_alert_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(ReportData {
        sessions,
        posture_snapshots,
        typing_snapshots,
        alerts,
    })
}
