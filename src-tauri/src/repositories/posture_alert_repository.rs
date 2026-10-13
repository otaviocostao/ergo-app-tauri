use rusqlite::{params, Connection, OptionalExtension};

use crate::models::posture_alert::{AlertFilter, PostureAlert};

pub const SELECT_POSTURE_ALERT_FIELDS: &str =
    "id, session_id, timestamp, alert_type, severity, duration_seconds, message, resolved_at, created_at";

pub fn map_posture_alert_row(row: &rusqlite::Row<'_>) -> Result<PostureAlert, rusqlite::Error> {
    Ok(PostureAlert {
        id: row.get(0)?,
        session_id: row.get(1)?,
        timestamp: row.get(2)?,
        alert_type: row.get(3)?,
        severity: row.get(4)?,
        duration_seconds: row.get(5)?,
        message: row.get(6)?,
        resolved_at: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<PostureAlert>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM posture_alerts WHERE id = ?1",
        SELECT_POSTURE_ALERT_FIELDS
    );
    conn.query_row(&query, params![id], map_posture_alert_row)
        .optional()
}

pub fn find_all_by_session_id(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<PostureAlert>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM posture_alerts WHERE session_id = ?1 ORDER BY datetime(timestamp) ASC, id ASC",
        SELECT_POSTURE_ALERT_FIELDS
    );
    let mut stmt = conn.prepare(&query)?;
    let iter = stmt.query_map(params![session_id], map_posture_alert_row)?;
    let mut alerts = Vec::new();
    for item in iter {
        alerts.push(item?);
    }
    Ok(alerts)
}

pub fn find_alerts(
    conn: &Connection,
    filter: &AlertFilter,
) -> Result<Vec<PostureAlert>, rusqlite::Error> {
    let mut sql = format!(
        "SELECT {} FROM posture_alerts WHERE 1=1",
        SELECT_POSTURE_ALERT_FIELDS
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref sid) = filter.session_id {
        sql.push_str(" AND session_id = ?");
        params_vec.push(Box::new(sid.clone()));
    }

    if let Some(ref at) = filter.alert_type {
        sql.push_str(" AND alert_type = ?");
        params_vec.push(Box::new(at.clone()));
    }

    if let Some(ref sev) = filter.severity {
        sql.push_str(" AND severity = ?");
        params_vec.push(Box::new(sev.clone()));
    }

    if let Some(true) = filter.unresolved_only {
        sql.push_str(" AND resolved_at IS NULL");
    }

    if let Some(ref st) = filter.start_time {
        sql.push_str(" AND datetime(timestamp) >= datetime(?)");
        params_vec.push(Box::new(st.clone()));
    }

    if let Some(ref et) = filter.end_time {
        sql.push_str(" AND datetime(timestamp) <= datetime(?)");
        params_vec.push(Box::new(et.clone()));
    }

    sql.push_str(" ORDER BY datetime(timestamp) ASC, id ASC");

    if let Some(limit) = filter.limit {
        sql.push_str(" LIMIT ?");
        params_vec.push(Box::new(limit));
    }

    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let iter = stmt.query_map(params_slice.as_slice(), map_posture_alert_row)?;
    let mut alerts = Vec::new();
    for item in iter {
        alerts.push(item?);
    }
    Ok(alerts)
}

pub fn insert(conn: &Connection, alert: &PostureAlert) -> Result<(), rusqlite::Error> {
    let query = "INSERT INTO posture_alerts (
        id, session_id, timestamp, alert_type, severity, duration_seconds, message, resolved_at, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)";

    conn.execute(
        query,
        params![
            alert.id,
            alert.session_id,
            alert.timestamp,
            alert.alert_type,
            alert.severity,
            alert.duration_seconds,
            alert.message,
            alert.resolved_at,
            alert.created_at,
        ],
    )?;

    Ok(())
}

pub fn resolve_alert(
    conn: &Connection,
    id: &str,
    resolved_at: &str,
) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "UPDATE posture_alerts SET resolved_at = ?1 WHERE id = ?2",
        params![resolved_at, id],
    )
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute("DELETE FROM posture_alerts WHERE id = ?1", params![id])
}

pub fn delete_by_session_id(conn: &Connection, session_id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM posture_alerts WHERE session_id = ?1",
        params![session_id],
    )
}

pub fn count_by_session_id(conn: &Connection, session_id: &str) -> Result<i64, rusqlite::Error> {
    conn.query_row(
        "SELECT COUNT(*) FROM posture_alerts WHERE session_id = ?1",
        params![session_id],
        |row| row.get(0),
    )
}
