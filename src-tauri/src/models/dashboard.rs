use serde::{Deserialize, Serialize};

use super::{
    monitoring_session::MonitoringSession, posture_alert::PostureAlert,
    posture_metric_snapshot::PostureMetricSnapshot, typing_metric_snapshot::TypingMetricSnapshot,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DashboardFilter {
    pub start_time: String,
    pub end_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub sessions: Vec<MonitoringSession>,
    pub snapshots: Vec<PostureMetricSnapshot>,
    pub alerts: Vec<PostureAlert>,
    pub typing_snapshots: Vec<TypingMetricSnapshot>,
    pub daily_goal_minutes: i64,
}
