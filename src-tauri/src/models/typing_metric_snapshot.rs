use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, ValueRef};
use rusqlite::ToSql;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

pub const DEFAULT_TYPING_WINDOW_DURATION_SECONDS: i64 = 60;

const fn default_window_duration_seconds() -> i64 {
    DEFAULT_TYPING_WINDOW_DURATION_SECONDS
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TypingStatus {
    #[default]
    #[serde(alias = "GOOD", alias = "Good")]
    Good,
    #[serde(alias = "WARNING", alias = "Warning")]
    Warning,
    #[serde(alias = "DANGER", alias = "Danger")]
    Danger,
}

impl TypingStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TypingStatus::Good => "good",
            TypingStatus::Warning => "warning",
            TypingStatus::Danger => "danger",
        }
    }
}

impl fmt::Display for TypingStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for TypingStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "good" => Ok(TypingStatus::Good),
            "warning" => Ok(TypingStatus::Warning),
            "danger" => Ok(TypingStatus::Danger),
            other => Err(format!("Unknown typing status: '{}'", other)),
        }
    }
}

impl ToSql for TypingStatus {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for TypingStatus {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let text = value.as_str()?;
        text.parse::<TypingStatus>().map_err(|e| {
            FromSqlError::Other(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                e,
            )))
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypingMetricSnapshot {
    pub id: String,
    pub session_id: String,
    pub timestamp: String,
    pub window_duration_seconds: i64,
    pub keystrokes_count: i64,
    pub cadence_cpm: f64,
    pub peak_cpm: f64,
    pub active_typing_seconds: i64,
    pub micro_pauses_count: i64,
    pub continuous_typing_minutes: i64,
    pub dominant_status: TypingStatus,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTypingSnapshotPayload {
    pub session_id: String,
    pub timestamp: Option<String>,
    #[serde(default = "default_window_duration_seconds")]
    pub window_duration_seconds: i64,
    pub keystrokes_count: i64,
    pub cadence_cpm: f64,
    pub peak_cpm: f64,
    pub active_typing_seconds: i64,
    pub micro_pauses_count: i64,
    pub continuous_typing_minutes: i64,
    pub dominant_status: TypingStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TypingSnapshotHistoryFilter {
    pub session_id: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveTypingMetrics {
    pub session_id: Option<String>,
    pub is_monitoring_active: bool,
    pub is_typing: bool,
    pub cpm: i64,
    pub peak_cpm: f64,
    pub total_keystrokes: i64,
    pub continuous_minutes: i64,
    pub dominant_status: TypingStatus,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    #[test]
    fn typing_status_parses_formats_and_serializes_correctly() {
        assert_eq!(TypingStatus::default(), TypingStatus::Good);
        assert_eq!(TypingStatus::Good.to_string(), "good");
        assert_eq!(TypingStatus::Warning.to_string(), "warning");
        assert_eq!(TypingStatus::Danger.to_string(), "danger");

        assert_eq!("good".parse::<TypingStatus>().unwrap(), TypingStatus::Good);
        assert_eq!(
            " WARNING ".parse::<TypingStatus>().unwrap(),
            TypingStatus::Warning
        );
        assert_eq!(
            "Danger".parse::<TypingStatus>().unwrap(),
            TypingStatus::Danger
        );
        assert!("critical".parse::<TypingStatus>().is_err());

        assert_eq!(
            serde_json::to_string(&TypingStatus::Warning).unwrap(),
            "\"warning\""
        );
        assert_eq!(
            serde_json::from_str::<TypingStatus>("\"DANGER\"").unwrap(),
            TypingStatus::Danger
        );
    }

    #[test]
    fn typing_status_roundtrips_through_rusqlite() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE status_test (status TEXT NOT NULL)", [])
            .unwrap();

        conn.execute(
            "INSERT INTO status_test (status) VALUES (?1)",
            params![TypingStatus::Danger],
        )
        .unwrap();

        let stored: TypingStatus = conn
            .query_row("SELECT status FROM status_test", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, TypingStatus::Danger);
    }

    #[test]
    fn payloads_and_live_metrics_use_camel_case_serialization() {
        let payload_json = r#"{
            "sessionId": "session-123",
            "keystrokesCount": 210,
            "cadenceCpm": 210.0,
            "peakCpm": 288.0,
            "activeTypingSeconds": 52,
            "microPausesCount": 3,
            "continuousTypingMinutes": 16,
            "dominantStatus": "warning"
        }"#;

        let payload: CreateTypingSnapshotPayload = serde_json::from_str(payload_json).unwrap();
        assert_eq!(payload.session_id, "session-123");
        assert_eq!(payload.timestamp, None);
        assert_eq!(payload.window_duration_seconds, 60);
        assert_eq!(payload.dominant_status, TypingStatus::Warning);

        let live = LiveTypingMetrics {
            session_id: Some("session-123".to_string()),
            is_monitoring_active: true,
            is_typing: true,
            cpm: 210,
            peak_cpm: 288.0,
            total_keystrokes: 1450,
            continuous_minutes: 16,
            dominant_status: TypingStatus::Warning,
        };

        let serialized = serde_json::to_value(&live).unwrap();
        assert_eq!(serialized["sessionId"], "session-123");
        assert_eq!(serialized["isMonitoringActive"], true);
        assert_eq!(serialized["isTyping"], true);
        assert_eq!(serialized["cpm"], 210);
        assert_eq!(serialized["peakCpm"], 288.0);
        assert_eq!(serialized["totalKeystrokes"], 1450);
        assert_eq!(serialized["continuousMinutes"], 16);
        assert_eq!(serialized["dominantStatus"], "warning");
    }
}

