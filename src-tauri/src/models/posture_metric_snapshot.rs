use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, ValueRef};
use rusqlite::ToSql;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PostureStatus {
    #[serde(alias = "GOOD", alias = "Good")]
    Good,
    #[serde(alias = "WARNING", alias = "Warning")]
    Warning,
    #[serde(alias = "DANGER", alias = "Danger")]
    Danger,
}

impl PostureStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            PostureStatus::Good => "good",
            PostureStatus::Warning => "warning",
            PostureStatus::Danger => "danger",
        }
    }
}

impl fmt::Display for PostureStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for PostureStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "good" => Ok(PostureStatus::Good),
            "warning" => Ok(PostureStatus::Warning),
            "danger" => Ok(PostureStatus::Danger),
            other => Err(format!("Unknown posture status: '{}'", other)),
        }
    }
}

impl ToSql for PostureStatus {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for PostureStatus {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let text = value.as_str()?;
        text.parse::<PostureStatus>()
            .map_err(|e| FromSqlError::Other(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e))))
    }
}

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
    pub dominant_status: PostureStatus,
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
    pub dominant_status: PostureStatus,
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
