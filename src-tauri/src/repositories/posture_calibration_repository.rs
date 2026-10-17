use rusqlite::{params, Connection, OptionalExtension};

use crate::models::posture_calibration::PostureCalibration;

pub const SELECT_POSTURE_CALIBRATION_FIELDS: &str =
    "id, user_id, baseline_neck_angle, baseline_shoulder_balance, baseline_distance_cm, baseline_eye_distance_px, is_active, created_at, updated_at";

pub fn map_posture_calibration_row(
    row: &rusqlite::Row<'_>,
) -> Result<PostureCalibration, rusqlite::Error> {
    let is_active_int: i32 = row.get(6)?;

    Ok(PostureCalibration {
        id: row.get(0)?,
        user_id: row.get(1)?,
        baseline_neck_angle: row.get(2)?,
        baseline_shoulder_balance: row.get(3)?,
        baseline_distance_cm: row.get(4)?,
        baseline_eye_distance_px: row.get(5)?,
        is_active: is_active_int != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn find_all(conn: &Connection) -> Result<Vec<PostureCalibration>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM posture_calibrations ORDER BY datetime(created_at) DESC, id DESC",
        SELECT_POSTURE_CALIBRATION_FIELDS
    );

    let mut stmt = conn.prepare(&query)?;
    let iter = stmt.query_map([], |row| map_posture_calibration_row(row))?;

    let mut calibrations = Vec::new();
    for item in iter {
        calibrations.push(item?);
    }

    Ok(calibrations)
}

pub fn find_by_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<PostureCalibration>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM posture_calibrations WHERE id = ?1",
        SELECT_POSTURE_CALIBRATION_FIELDS
    );

    conn.query_row(&query, params![id], |row| {
        map_posture_calibration_row(row)
    })
    .optional()
}

pub fn find_active(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<Option<PostureCalibration>, rusqlite::Error> {
    match user_id {
        Some(uid) => {
            let query = format!(
                "SELECT {} FROM posture_calibrations WHERE user_id = ?1 AND is_active = 1 ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
                SELECT_POSTURE_CALIBRATION_FIELDS
            );
            if let Some(calib) = conn
                .query_row(&query, params![uid], |row| {
                    map_posture_calibration_row(row)
                })
                .optional()?
            {
                return Ok(Some(calib));
            }

            let fallback_query = format!(
                "SELECT {} FROM posture_calibrations WHERE user_id IS NULL AND is_active = 1 ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
                SELECT_POSTURE_CALIBRATION_FIELDS
            );
            conn.query_row(&fallback_query, [], |row| {
                map_posture_calibration_row(row)
            })
            .optional()
        }
        None => {
            let query = format!(
                "SELECT {} FROM posture_calibrations WHERE is_active = 1 ORDER BY datetime(created_at) DESC, id DESC LIMIT 1",
                SELECT_POSTURE_CALIBRATION_FIELDS
            );
            conn.query_row(&query, [], |row| {
                map_posture_calibration_row(row)
            })
            .optional()
        }
    }
}

pub fn deactivate_all(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<usize, rusqlite::Error> {
    match user_id {
        Some(uid) => conn.execute(
            "UPDATE posture_calibrations SET is_active = 0 WHERE (user_id = ?1 OR user_id IS NULL) AND is_active = 1",
            params![uid],
        ),
        None => conn.execute(
            "UPDATE posture_calibrations SET is_active = 0 WHERE is_active = 1",
            [],
        ),
    }
}

pub fn insert(
    conn: &Connection,
    calibration: &PostureCalibration,
) -> Result<(), rusqlite::Error> {
    let is_active_int = if calibration.is_active { 1 } else { 0 };

    conn.execute(
        "INSERT INTO posture_calibrations (
            id, user_id, baseline_neck_angle, baseline_shoulder_balance,
            baseline_distance_cm, baseline_eye_distance_px, is_active,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            calibration.id,
            calibration.user_id,
            calibration.baseline_neck_angle,
            calibration.baseline_shoulder_balance,
            calibration.baseline_distance_cm,
            calibration.baseline_eye_distance_px,
            is_active_int,
            calibration.created_at,
            calibration.updated_at,
        ],
    )?;

    Ok(())
}

pub fn update(
    conn: &Connection,
    calibration: &PostureCalibration,
) -> Result<usize, rusqlite::Error> {
    let is_active_int = if calibration.is_active { 1 } else { 0 };

    conn.execute(
        "UPDATE posture_calibrations SET
            user_id = ?1,
            baseline_neck_angle = ?2,
            baseline_shoulder_balance = ?3,
            baseline_distance_cm = ?4,
            baseline_eye_distance_px = ?5,
            is_active = ?6,
            updated_at = ?7
        WHERE id = ?8",
        params![
            calibration.user_id,
            calibration.baseline_neck_angle,
            calibration.baseline_shoulder_balance,
            calibration.baseline_distance_cm,
            calibration.baseline_eye_distance_px,
            is_active_int,
            calibration.updated_at,
            calibration.id,
        ],
    )
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM posture_calibrations WHERE id = ?1",
        params![id],
    )
}
