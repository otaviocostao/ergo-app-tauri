use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitoringSession {
    pub id: String,
    pub user_id: Option<i64>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i64,
    pub average_score: f64,
    pub good_posture_percentage: f64,
    pub warning_posture_percentage: f64,
    pub danger_posture_percentage: f64,
    pub total_alerts_count: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionPayload {
    pub user_id: Option<i64>,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndSessionPayload {
    pub id: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub average_score: Option<f64>,
    pub good_posture_percentage: Option<f64>,
    pub warning_posture_percentage: Option<f64>,
    pub danger_posture_percentage: Option<f64>,
    pub total_alerts_count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionPayload {
    pub id: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub average_score: Option<f64>,
    pub good_posture_percentage: Option<f64>,
    pub warning_posture_percentage: Option<f64>,
    pub danger_posture_percentage: Option<f64>,
    pub total_alerts_count: Option<i64>,
}

pub type CreateMonitoringSessionPayload = CreateSessionPayload;
pub type EndMonitoringSessionPayload = EndSessionPayload;
pub type UpdateMonitoringSessionPayload = UpdateSessionPayload;
