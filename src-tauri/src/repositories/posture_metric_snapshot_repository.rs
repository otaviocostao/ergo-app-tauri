use rusqlite::{params, Connection, OptionalExtension};

use crate::models::posture_metric_snapshot::{PostureMetricSnapshot, SnapshotHistoryFilter};

pub const SELECT_POSTURE_METRIC_SNAPSHOT_FIELDS: &str =
    "id, session_id, timestamp, avg_neck_angle, max_neck_angle, avg_shoulder_balance, min_shoulder_balance, avg_distance_cm, blink_count, dominant_status, score, samples_count, created_at";

pub fn map_posture_metric_snapshot_row(
    row: &rusqlite::Row<'_>,
) -> Result<PostureMetricSnapshot, rusqlite::Error> {
    Ok(PostureMetricSnapshot {
        id: row.get(0)?,
        session_id: row.get(1)?,
        timestamp: row.get(2)?,
        avg_neck_angle: row.get(3)?,
        max_neck_angle: row.get(4)?,
        avg_shoulder_balance: row.get(5)?,
        min_shoulder_balance: row.get(6)?,
        avg_distance_cm: row.get(7)?,
        blink_count: row.get(8)?,
        dominant_status: row.get(9)?,
        score: row.get(10)?,
        samples_count: row.get(11)?,
        created_at: row.get(12)?,
    })
}

pub fn find_by_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<PostureMetricSnapshot>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM posture_metrics_snapshots WHERE id = ?1",
        SELECT_POSTURE_METRIC_SNAPSHOT_FIELDS
    );
    conn.query_row(&query, params![id], map_posture_metric_snapshot_row)
        .optional()
}

pub fn find_all_by_session_id(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<PostureMetricSnapshot>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM posture_metrics_snapshots WHERE session_id = ?1 ORDER BY datetime(timestamp) ASC, id ASC",
        SELECT_POSTURE_METRIC_SNAPSHOT_FIELDS
    );
    let mut stmt = conn.prepare(&query)?;
    let iter = stmt.query_map(params![session_id], map_posture_metric_snapshot_row)?;
    let mut snapshots = Vec::new();
    for item in iter {
        snapshots.push(item?);
    }
    Ok(snapshots)
}

pub fn find_history(
    conn: &Connection,
    filter: &SnapshotHistoryFilter,
) -> Result<Vec<PostureMetricSnapshot>, rusqlite::Error> {
    let mut sql = format!(
        "SELECT {} FROM posture_metrics_snapshots WHERE 1=1",
        SELECT_POSTURE_METRIC_SNAPSHOT_FIELDS
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref sid) = filter.session_id {
        sql.push_str(" AND session_id = ?");
        params_vec.push(Box::new(sid.clone()));
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
    let iter = stmt.query_map(params_slice.as_slice(), map_posture_metric_snapshot_row)?;
    let mut snapshots = Vec::new();
    for item in iter {
        snapshots.push(item?);
    }
    Ok(snapshots)
}

pub fn insert(
    conn: &Connection,
    snapshot: &PostureMetricSnapshot,
) -> Result<(), rusqlite::Error> {
    let query = "INSERT INTO posture_metrics_snapshots (
        id, session_id, timestamp, avg_neck_angle, max_neck_angle,
        avg_shoulder_balance, min_shoulder_balance, avg_distance_cm,
        blink_count, dominant_status, score, samples_count, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)";

    conn.execute(
        query,
        params![
            snapshot.id,
            snapshot.session_id,
            snapshot.timestamp,
            snapshot.avg_neck_angle,
            snapshot.max_neck_angle,
            snapshot.avg_shoulder_balance,
            snapshot.min_shoulder_balance,
            snapshot.avg_distance_cm,
            snapshot.blink_count,
            snapshot.dominant_status,
            snapshot.score,
            snapshot.samples_count,
            snapshot.created_at,
        ],
    )?;

    Ok(())
}

pub fn insert_batch(
    conn: &Connection,
    snapshots: &[PostureMetricSnapshot],
) -> Result<usize, rusqlite::Error> {
    if snapshots.is_empty() {
        return Ok(0);
    }

    let tx = conn.unchecked_transaction()?;
    {
        let query = "INSERT INTO posture_metrics_snapshots (
            id, session_id, timestamp, avg_neck_angle, max_neck_angle,
            avg_shoulder_balance, min_shoulder_balance, avg_distance_cm,
            blink_count, dominant_status, score, samples_count, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)";
        let mut stmt = tx.prepare(query)?;

        for snapshot in snapshots {
            stmt.execute(params![
                snapshot.id,
                snapshot.session_id,
                snapshot.timestamp,
                snapshot.avg_neck_angle,
                snapshot.max_neck_angle,
                snapshot.avg_shoulder_balance,
                snapshot.min_shoulder_balance,
                snapshot.avg_distance_cm,
                snapshot.blink_count,
                snapshot.dominant_status,
                snapshot.score,
                snapshot.samples_count,
                snapshot.created_at,
            ])?;
        }
    }
    tx.commit()?;

    Ok(snapshots.len())
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM posture_metrics_snapshots WHERE id = ?1",
        params![id],
    )
}

pub fn delete_by_session_id(conn: &Connection, session_id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM posture_metrics_snapshots WHERE session_id = ?1",
        params![session_id],
    )
}
