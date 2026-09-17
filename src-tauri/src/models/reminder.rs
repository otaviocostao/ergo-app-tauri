use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, ValueRef};
use rusqlite::ToSql;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReminderFrequency {
    Once,
    Daily,
    BusinessDays,
    Weekends,
    Custom,
}

impl ReminderFrequency {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReminderFrequency::Once => "ONCE",
            ReminderFrequency::Daily => "DAILY",
            ReminderFrequency::BusinessDays => "BUSINESS_DAYS",
            ReminderFrequency::Weekends => "WEEKENDS",
            ReminderFrequency::Custom => "CUSTOM",
        }
    }
}

impl fmt::Display for ReminderFrequency {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for ReminderFrequency {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "ONCE" => Ok(ReminderFrequency::Once),
            "DAILY" => Ok(ReminderFrequency::Daily),
            "BUSINESS_DAYS" => Ok(ReminderFrequency::BusinessDays),
            "WEEKENDS" => Ok(ReminderFrequency::Weekends),
            "CUSTOM" => Ok(ReminderFrequency::Custom),
            other => Err(format!("Unknown reminder frequency: {}", other)),
        }
    }
}

impl ToSql for ReminderFrequency {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for ReminderFrequency {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let text = value.as_str()?;
        text.parse::<ReminderFrequency>()
            .map_err(|e| FromSqlError::Other(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e))))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub title: String,
    pub message: String,
    pub description: Option<String>,
    pub category: String,
    pub interval: i32,
    pub period: String,
    pub frequency: ReminderFrequency,
    pub notification_tone: bool,
    pub status: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub reminder_date: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReminderPayload {
    pub title: String,
    pub message: String,
    pub description: Option<String>,
    pub category: String,
    pub interval: i32,
    pub period: String,
    pub frequency: ReminderFrequency,
    pub notification_tone: Option<bool>,
    pub status: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub reminder_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReminderPayload {
    pub id: String,
    pub title: Option<String>,
    pub message: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub interval: Option<i32>,
    pub period: Option<String>,
    pub frequency: Option<ReminderFrequency>,
    pub notification_tone: Option<bool>,
    pub status: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub reminder_date: Option<String>,
}
