use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: i64,
    pub external_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub email: String,
    pub phone: String,
    pub position: Option<String>,
    pub photo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserPayload {
    pub external_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub password: String,
    pub email: String,
    pub phone: String,
    pub position: Option<String>,
    pub photo: Option<String>,
}
