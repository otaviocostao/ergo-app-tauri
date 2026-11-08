use rusqlite::{params, Connection, OptionalExtension};

use crate::models::typing_metric_snapshot::{TypingMetricSnapshot, TypingSnapshotHistoryFilter};

pub const SELECT_TYPING_SNAPSHOT_FIELDS: &str =
    "id, session_id, timestamp, window_duration_seconds, keystrokes_count, cadence_cpm, peak_cpm, active_typing_seconds, micro_pauses_count, continuous_typing_minutes, dominant_status, created_at";

pub fn map_typing_snapshot_row(
    row: &rusqlite::Row<'_>,
) -> Result<TypingMetricSnapshot, rusqlite::Error> {
    Ok(TypingMetricSnapshot {
        id: row.get(0)?,
        session_id: row.get(1)?,
        timestamp: row.get(2)?,
        window_duration_seconds: row.get(3)?,
        keystrokes_count: row.get(4)?,
        cadence_cpm: row.get(5)?,
        peak_cpm: row.get(6)?,
        active_typing_seconds: row.get(7)?,
        micro_pauses_count: row.get(8)?,
        continuous_typing_minutes: row.get(9)?,
        dominant_status: row.get(10)?,
        created_at: row.get(11)?,
    })
}

pub fn find_by_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<TypingMetricSnapshot>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM typing_metrics_snapshots WHERE id = ?1",
        SELECT_TYPING_SNAPSHOT_FIELDS
    );
    conn.query_row(&query, params![id], map_typing_snapshot_row)
        .optional()
}

pub fn find_all_by_session_id(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<TypingMetricSnapshot>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM typing_metrics_snapshots WHERE session_id = ?1 ORDER BY datetime(timestamp) ASC, id ASC",
        SELECT_TYPING_SNAPSHOT_FIELDS
    );
    let mut stmt = conn.prepare(&query)?;
    let iter = stmt.query_map(params![session_id], map_typing_snapshot_row)?;
    let mut snapshots = Vec::new();
    for item in iter {
        snapshots.push(item?);
    }
    Ok(snapshots)
}

pub fn find_history(
    conn: &Connection,
    filter: &TypingSnapshotHistoryFilter,
) -> Result<Vec<TypingMetricSnapshot>, rusqlite::Error> {
    let mut sql = format!(
        "SELECT {} FROM typing_metrics_snapshots WHERE 1=1",
        SELECT_TYPING_SNAPSHOT_FIELDS
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
    let iter = stmt.query_map(params_slice.as_slice(), map_typing_snapshot_row)?;
    let mut snapshots = Vec::new();
    for item in iter {
        snapshots.push(item?);
    }
    Ok(snapshots)
}

pub fn insert(conn: &Connection, snapshot: &TypingMetricSnapshot) -> Result<(), rusqlite::Error> {
    let query = "INSERT INTO typing_metrics_snapshots (
        id, session_id, timestamp, window_duration_seconds, keystrokes_count,
        cadence_cpm, peak_cpm, active_typing_seconds, micro_pauses_count,
        continuous_typing_minutes, dominant_status, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, COALESCE(?12, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))";

    conn.execute(
        query,
        params![
            snapshot.id,
            snapshot.session_id,
            snapshot.timestamp,
            snapshot.window_duration_seconds,
            snapshot.keystrokes_count,
            snapshot.cadence_cpm,
            snapshot.peak_cpm,
            snapshot.active_typing_seconds,
            snapshot.micro_pauses_count,
            snapshot.continuous_typing_minutes,
            snapshot.dominant_status,
            snapshot.created_at,
        ],
    )?;

    Ok(())
}

pub fn insert_batch(
    conn: &Connection,
    snapshots: &[TypingMetricSnapshot],
) -> Result<(), rusqlite::Error> {
    if snapshots.is_empty() {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    {
        let query = "INSERT INTO typing_metrics_snapshots (
            id, session_id, timestamp, window_duration_seconds, keystrokes_count,
            cadence_cpm, peak_cpm, active_typing_seconds, micro_pauses_count,
            continuous_typing_minutes, dominant_status, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, COALESCE(?12, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))";
        let mut stmt = tx.prepare(query)?;

        for snapshot in snapshots {
            stmt.execute(params![
                snapshot.id,
                snapshot.session_id,
                snapshot.timestamp,
                snapshot.window_duration_seconds,
                snapshot.keystrokes_count,
                snapshot.cadence_cpm,
                snapshot.peak_cpm,
                snapshot.active_typing_seconds,
                snapshot.micro_pauses_count,
                snapshot.continuous_typing_minutes,
                snapshot.dominant_status,
                snapshot.created_at,
            ])?;
        }
    }
    tx.commit()?;

    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM typing_metrics_snapshots WHERE id = ?1",
        params![id],
    )
}

pub fn delete_by_session_id(conn: &Connection, session_id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM typing_metrics_snapshots WHERE session_id = ?1",
        params![session_id],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::typing_metric_snapshot::TypingStatus;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute(
            "INSERT INTO monitoring_sessions (id, started_at) VALUES ('session-a', '2026-11-04T10:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO monitoring_sessions (id, started_at) VALUES ('session-b', '2026-11-04T11:00:00Z')",
            [],
        )
        .unwrap();
        conn
    }

    fn build_snapshot(
        id: &str,
        session_id: &str,
        timestamp: &str,
        keystrokes_count: i64,
        status: TypingStatus,
    ) -> TypingMetricSnapshot {
        TypingMetricSnapshot {
            id: id.to_string(),
            session_id: session_id.to_string(),
            timestamp: timestamp.to_string(),
            window_duration_seconds: 60,
            keystrokes_count,
            cadence_cpm: keystrokes_count as f64,
            peak_cpm: (keystrokes_count as f64) * 1.25,
            active_typing_seconds: 42,
            micro_pauses_count: 3,
            continuous_typing_minutes: 5,
            dominant_status: status,
            created_at: Some("2026-11-04T10:01:00Z".to_string()),
        }
    }

    #[test]
    fn crud_and_history_queries_work_as_expected() {
        let conn = setup_test_db();

        let first = build_snapshot(
            "snap-1",
            "session-a",
            "2026-11-04T10:01:00Z",
            180,
            TypingStatus::Good,
        );
        insert(&conn, &first).unwrap();

        let fetched = find_by_id(&conn, "snap-1").unwrap().unwrap();
        assert_eq!(fetched, first);
        assert!(find_by_id(&conn, "missing").unwrap().is_none());

        let batch = vec![
            build_snapshot(
                "snap-2",
                "session-a",
                "2026-11-04T10:02:00Z",
                210,
                TypingStatus::Warning,
            ),
            build_snapshot(
                "snap-3",
                "session-b",
                "2026-11-04T11:01:00Z",
                260,
                TypingStatus::Danger,
            ),
        ];
        insert_batch(&conn, &batch).unwrap();
        insert_batch(&conn, &[]).unwrap();

        let session_a_items = find_all_by_session_id(&conn, "session-a").unwrap();
        assert_eq!(session_a_items.len(), 2);
        assert_eq!(session_a_items[0].id, "snap-1");
        assert_eq!(session_a_items[1].id, "snap-2");

        let filtered = find_history(
            &conn,
            &TypingSnapshotHistoryFilter {
                session_id: None,
                start_time: Some("2026-11-04T10:01:30Z".to_string()),
                end_time: Some("2026-11-04T11:05:00Z".to_string()),
                limit: Some(1),
            },
        )
        .unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "snap-2");

        assert_eq!(delete(&conn, "snap-1").unwrap(), 1);
        assert_eq!(delete(&conn, "snap-1").unwrap(), 0);
        assert_eq!(delete_by_session_id(&conn, "session-b").unwrap(), 1);
    }
}

