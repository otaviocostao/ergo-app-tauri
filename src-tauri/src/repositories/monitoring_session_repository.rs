use rusqlite::{params, Connection, OptionalExtension};

use crate::models::monitoring_session::MonitoringSession;

pub const SELECT_MONITORING_SESSION_FIELDS: &str =
    "id, user_id, started_at, ended_at, duration_seconds, average_score, good_posture_percentage, warning_posture_percentage, danger_posture_percentage, total_alerts_count, created_at, updated_at";

pub fn map_monitoring_session_row(
    row: &rusqlite::Row<'_>,
) -> Result<MonitoringSession, rusqlite::Error> {
    Ok(MonitoringSession {
        id: row.get(0)?,
        user_id: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        duration_seconds: row.get(4)?,
        average_score: row.get(5)?,
        good_posture_percentage: row.get(6)?,
        warning_posture_percentage: row.get(7)?,
        danger_posture_percentage: row.get(8)?,
        total_alerts_count: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

pub fn find_all(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<Vec<MonitoringSession>, rusqlite::Error> {
    match user_id {
        Some(uid) => {
            let query = format!(
                "SELECT {} FROM monitoring_sessions WHERE user_id = ?1 ORDER BY datetime(started_at) DESC, id DESC",
                SELECT_MONITORING_SESSION_FIELDS
            );
            let mut stmt = conn.prepare(&query)?;
            let iter = stmt.query_map(params![uid], map_monitoring_session_row)?;
            let mut sessions = Vec::new();
            for item in iter {
                sessions.push(item?);
            }
            Ok(sessions)
        }
        None => {
            let query = format!(
                "SELECT {} FROM monitoring_sessions ORDER BY datetime(started_at) DESC, id DESC",
                SELECT_MONITORING_SESSION_FIELDS
            );
            let mut stmt = conn.prepare(&query)?;
            let iter = stmt.query_map([], map_monitoring_session_row)?;
            let mut sessions = Vec::new();
            for item in iter {
                sessions.push(item?);
            }
            Ok(sessions)
        }
    }
}

pub fn find_by_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<MonitoringSession>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM monitoring_sessions WHERE id = ?1",
        SELECT_MONITORING_SESSION_FIELDS
    );
    conn.query_row(&query, params![id], map_monitoring_session_row)
        .optional()
}

pub fn find_active(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<Option<MonitoringSession>, rusqlite::Error> {
    match user_id {
        Some(uid) => {
            let query = format!(
                "SELECT {} FROM monitoring_sessions WHERE user_id = ?1 AND ended_at IS NULL ORDER BY datetime(started_at) DESC, id DESC LIMIT 1",
                SELECT_MONITORING_SESSION_FIELDS
            );
            if let Some(session) = conn
                .query_row(&query, params![uid], map_monitoring_session_row)
                .optional()?
            {
                return Ok(Some(session));
            }

            let fallback_query = format!(
                "SELECT {} FROM monitoring_sessions WHERE user_id IS NULL AND ended_at IS NULL ORDER BY datetime(started_at) DESC, id DESC LIMIT 1",
                SELECT_MONITORING_SESSION_FIELDS
            );
            conn.query_row(&fallback_query, [], map_monitoring_session_row)
                .optional()
        }
        None => {
            let query = format!(
                "SELECT {} FROM monitoring_sessions WHERE ended_at IS NULL ORDER BY datetime(started_at) DESC, id DESC LIMIT 1",
                SELECT_MONITORING_SESSION_FIELDS
            );
            conn.query_row(&query, [], map_monitoring_session_row)
                .optional()
        }
    }
}

pub fn insert(conn: &Connection, session: &MonitoringSession) -> Result<(), rusqlite::Error> {
    let query = "INSERT INTO monitoring_sessions (
        id, user_id, started_at, ended_at, duration_seconds,
        average_score, good_posture_percentage, warning_posture_percentage,
        danger_posture_percentage, total_alerts_count, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)";

    conn.execute(
        query,
        params![
            session.id,
            session.user_id,
            session.started_at,
            session.ended_at,
            session.duration_seconds,
            session.average_score,
            session.good_posture_percentage,
            session.warning_posture_percentage,
            session.danger_posture_percentage,
            session.total_alerts_count,
            session.created_at,
            session.updated_at,
        ],
    )?;

    Ok(())
}

pub fn update(conn: &Connection, session: &MonitoringSession) -> Result<usize, rusqlite::Error> {
    let query = "UPDATE monitoring_sessions SET
        user_id = ?1,
        started_at = ?2,
        ended_at = ?3,
        duration_seconds = ?4,
        average_score = ?5,
        good_posture_percentage = ?6,
        warning_posture_percentage = ?7,
        danger_posture_percentage = ?8,
        total_alerts_count = ?9,
        updated_at = ?10
    WHERE id = ?11";

    conn.execute(
        query,
        params![
            session.user_id,
            session.started_at,
            session.ended_at,
            session.duration_seconds,
            session.average_score,
            session.good_posture_percentage,
            session.warning_posture_percentage,
            session.danger_posture_percentage,
            session.total_alerts_count,
            session.updated_at,
            session.id,
        ],
    )
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM monitoring_sessions WHERE id = ?1",
        params![id],
    )
}
