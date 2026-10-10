use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostureCalibration {
    pub id: String,
    pub user_id: Option<i64>,
    pub baseline_neck_angle: f64,
    pub baseline_shoulder_balance: f64,
    pub baseline_distance_cm: f64,
    pub baseline_eye_distance_px: f64,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCalibrationPayload {
    pub user_id: Option<i64>,
    pub baseline_neck_angle: f64,
    pub baseline_shoulder_balance: f64,
    pub baseline_distance_cm: f64,
    pub baseline_eye_distance_px: f64,
    pub is_active: Option<bool>,
}
