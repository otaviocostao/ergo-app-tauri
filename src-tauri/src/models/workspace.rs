use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, ValueRef};
use rusqlite::ToSql;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    #[serde(alias = "DESKTOP", alias = "Desktop")]
    Desktop,
    #[serde(alias = "NOTEBOOK", alias = "Notebook", alias = "laptop", alias = "LAPTOP", alias = "Laptop")]
    Notebook,
}

impl Default for DeviceType {
    fn default() -> Self {
        DeviceType::Desktop
    }
}

impl DeviceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DeviceType::Desktop => "desktop",
            DeviceType::Notebook => "notebook",
        }
    }
}

impl fmt::Display for DeviceType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for DeviceType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "desktop" => Ok(DeviceType::Desktop),
            "notebook" | "laptop" => Ok(DeviceType::Notebook),
            other => Err(format!("Unknown device type: '{}'", other)),
        }
    }
}

impl ToSql for DeviceType {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for DeviceType {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let text = value.as_str()?;
        text.parse::<DeviceType>()
            .map_err(|e| FromSqlError::Other(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e))))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub device_type: DeviceType,
    pub is_webcam_front: bool,
    pub has_external_keyboard: bool,
    pub has_external_mouse: bool,
    pub adjustable_desk: bool,
    pub adjustable_chair: bool,
    pub adjustable_monitor: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspacePayload {
    pub device_type: Option<DeviceType>,
    pub is_webcam_front: Option<bool>,
    pub has_external_keyboard: Option<bool>,
    pub has_external_mouse: Option<bool>,
    pub adjustable_desk: Option<bool>,
    pub adjustable_chair: Option<bool>,
    pub adjustable_monitor: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkspacePayload {
    pub id: String,
    pub device_type: Option<DeviceType>,
    pub is_webcam_front: Option<bool>,
    pub has_external_keyboard: Option<bool>,
    pub has_external_mouse: Option<bool>,
    pub adjustable_desk: Option<bool>,
    pub adjustable_chair: Option<bool>,
    pub adjustable_monitor: Option<bool>,
}
