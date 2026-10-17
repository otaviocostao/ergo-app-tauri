use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::posture_calibration::{PostureCalibration, SaveCalibrationPayload};
use crate::repositories::posture_calibration_repository;

pub fn validate_calibration_payload(payload: &SaveCalibrationPayload) -> Result<(), String> {
    if !payload.baseline_neck_angle.is_finite() {
        return Err("Baseline neck angle must be a valid number".to_string());
    }
    if !payload.baseline_shoulder_balance.is_finite() {
        return Err("Baseline shoulder balance must be a valid number".to_string());
    }
    if !payload.baseline_distance_cm.is_finite() || payload.baseline_distance_cm <= 0.0 {
        return Err("Baseline distance (cm) must be greater than zero".to_string());
    }
    if !payload.baseline_eye_distance_px.is_finite() || payload.baseline_eye_distance_px <= 0.0 {
        return Err("Baseline eye distance (px) must be greater than zero".to_string());
    }

    Ok(())
}

pub fn get_posture_calibrations(conn: &Connection) -> Result<Vec<PostureCalibration>, String> {
    posture_calibration_repository::find_all(conn).map_err(|e| e.to_string())
}

pub fn get_posture_calibration_by_id(
    conn: &Connection,
    id: &str,
) -> Result<PostureCalibration, String> {
    posture_calibration_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Posture calibration with id '{}' not found", id))
}

pub fn get_active_calibration(
    conn: &Connection,
    user_id: Option<i64>,
) -> Result<Option<PostureCalibration>, String> {
    posture_calibration_repository::find_active(conn, user_id).map_err(|e| e.to_string())
}

pub fn save_posture_calibration(
    conn: &Connection,
    payload: SaveCalibrationPayload,
) -> Result<PostureCalibration, String> {
    validate_calibration_payload(&payload)?;

    let is_active = payload.is_active.unwrap_or(true);

    if is_active {
        posture_calibration_repository::deactivate_all(conn, payload.user_id)
            .map_err(|e| e.to_string())?;
    }

    let calibration_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let calibration = PostureCalibration {
        id: calibration_id,
        user_id: payload.user_id,
        baseline_neck_angle: payload.baseline_neck_angle,
        baseline_shoulder_balance: payload.baseline_shoulder_balance,
        baseline_distance_cm: payload.baseline_distance_cm,
        baseline_eye_distance_px: payload.baseline_eye_distance_px,
        is_active,
        created_at: Some(now.clone()),
        updated_at: Some(now),
    };

    posture_calibration_repository::insert(conn, &calibration).map_err(|e| e.to_string())?;

    Ok(calibration)
}

pub fn delete_posture_calibration(conn: &Connection, id: &str) -> Result<bool, String> {
    let affected = posture_calibration_repository::delete(conn, id).map_err(|e| e.to_string())?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn
    }

    #[test]
    fn test_save_and_get_active_calibration() {
        let conn = setup_test_db();

        let payload = SaveCalibrationPayload {
            user_id: None,
            baseline_neck_angle: 12.5,
            baseline_shoulder_balance: 0.98,
            baseline_distance_cm: 65.0,
            baseline_eye_distance_px: 54.0,
            is_active: Some(true),
        };

        let saved = save_posture_calibration(&conn, payload).unwrap();
        assert_eq!(saved.baseline_neck_angle, 12.5);
        assert!(saved.is_active);

        let active = get_active_calibration(&conn, None).unwrap();
        assert!(active.is_some());
        let active = active.unwrap();
        assert_eq!(active.id, saved.id);
        assert_eq!(active.baseline_distance_cm, 65.0);
    }

    #[test]
    fn test_saving_new_active_deactivates_previous() {
        let conn = setup_test_db();

        let payload1 = SaveCalibrationPayload {
            user_id: None,
            baseline_neck_angle: 10.0,
            baseline_shoulder_balance: 1.0,
            baseline_distance_cm: 60.0,
            baseline_eye_distance_px: 50.0,
            is_active: Some(true),
        };
        let first = save_posture_calibration(&conn, payload1).unwrap();

        let payload2 = SaveCalibrationPayload {
            user_id: None,
            baseline_neck_angle: 14.0,
            baseline_shoulder_balance: 0.95,
            baseline_distance_cm: 68.0,
            baseline_eye_distance_px: 55.0,
            is_active: Some(true),
        };
        let second = save_posture_calibration(&conn, payload2).unwrap();

        // The first calibration should now be inactive
        let first_reloaded = get_posture_calibration_by_id(&conn, &first.id).unwrap();
        assert!(!first_reloaded.is_active);

        // The second calibration is active
        let active = get_active_calibration(&conn, None).unwrap().unwrap();
        assert_eq!(active.id, second.id);
        assert!(active.is_active);
    }

    #[test]
    fn test_validate_calibration_rejects_invalid_values() {
        let conn = setup_test_db();

        let invalid_payload = SaveCalibrationPayload {
            user_id: None,
            baseline_neck_angle: f64::NAN,
            baseline_shoulder_balance: 1.0,
            baseline_distance_cm: 60.0,
            baseline_eye_distance_px: 50.0,
            is_active: Some(true),
        };
        let result = save_posture_calibration(&conn, invalid_payload);
        assert!(result.is_err());

        let invalid_distance = SaveCalibrationPayload {
            user_id: None,
            baseline_neck_angle: 10.0,
            baseline_shoulder_balance: 1.0,
            baseline_distance_cm: 0.0,
            baseline_eye_distance_px: 50.0,
            is_active: Some(true),
        };
        let result = save_posture_calibration(&conn, invalid_distance);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_calibration() {
        let conn = setup_test_db();

        let payload = SaveCalibrationPayload {
            user_id: None,
            baseline_neck_angle: 10.0,
            baseline_shoulder_balance: 1.0,
            baseline_distance_cm: 60.0,
            baseline_eye_distance_px: 50.0,
            is_active: Some(false),
        };
        let saved = save_posture_calibration(&conn, payload).unwrap();
        let deleted = delete_posture_calibration(&conn, &saved.id).unwrap();
        assert!(deleted);

        let find_result = get_posture_calibration_by_id(&conn, &saved.id);
        assert!(find_result.is_err());
    }
}
