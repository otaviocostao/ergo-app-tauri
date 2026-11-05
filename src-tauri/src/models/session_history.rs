use serde::{Deserialize, Serialize};

use super::{
    monitoring_session::MonitoringSession, posture_alert::PostureAlert,
    posture_metric_snapshot::PostureStatus,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMinute {
    pub started_at: String,
    pub ended_at: String,
    pub status: Option<PostureStatus>,
    pub samples_count: i64,
    pub summaries_count: i64,
    pub state: HistoryMinuteState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HistoryMinuteState {
    Pending,
    Recorded,
    Absent,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistory {
    pub session: Option<MonitoringSession>,
    pub window_start: String,
    pub window_end: String,
    pub timeline: Vec<HistoryMinute>,
    /// Percentage of evaluated, completed session minutes whose dominant status is good.
    pub adequate_summary_percentage: Option<f64>,
    pub alerts: Vec<PostureAlert>,
}
