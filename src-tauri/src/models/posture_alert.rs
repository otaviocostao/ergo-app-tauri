use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostureAlert {
    pub id: String,
    pub session_id: String,
    pub timestamp: String,
    pub alert_type: String,
    pub severity: String,
    #[serde(alias = "persistentDurationSeconds", alias = "persistent_duration_seconds")]
    pub duration_seconds: i64,
    pub message: String,
    pub resolved_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAlertPayload {
    pub session_id: String,
    pub timestamp: Option<String>,
    pub alert_type: String,
    pub severity: Option<String>,
    #[serde(default, alias = "persistentDurationSeconds", alias = "persistent_duration_seconds")]
    pub duration_seconds: Option<i64>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveAlertPayload {
    pub id: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AlertFilter {
    pub session_id: Option<String>,
    pub alert_type: Option<String>,
    pub severity: Option<String>,
    pub unresolved_only: Option<bool>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub limit: Option<i64>,
}
