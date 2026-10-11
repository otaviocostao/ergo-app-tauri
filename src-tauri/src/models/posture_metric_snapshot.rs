use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostureMetricSnapshot {
    pub id: String,
    pub session_id: String,
    pub timestamp: String,
    pub avg_neck_angle: f64,
    pub max_neck_angle: f64,
    pub avg_shoulder_balance: f64,
    pub min_shoulder_balance: f64,
    pub avg_distance_cm: f64,
    pub blink_count: i64,
    pub dominant_status: String,
    pub score: f64,
    pub samples_count: i64,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnapshotPayload {
    pub session_id: String,
    pub timestamp: Option<String>,
    pub avg_neck_angle: f64,
    pub max_neck_angle: f64,
    pub avg_shoulder_balance: f64,
    pub min_shoulder_balance: f64,
    pub avg_distance_cm: f64,
    pub blink_count: i64,
    pub dominant_status: String,
    pub score: f64,
    pub samples_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotHistoryFilter {
    pub session_id: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub limit: Option<i64>,
}
