use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: i64,
    pub external_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub email: String,
    pub phone: String,
    pub photo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserPayload {
    pub external_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub password: String,
    pub email: String,
    pub phone: String,
    pub photo: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserPayload {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub email: String,
    pub phone: String,
    pub photo: Option<String>,
}

#[derive(Clone, Debug)]
pub struct StoredUser {
    pub user: User,
    pub password_hash: String,
}

#[derive(Clone, Debug)]
pub struct NewUser {
    pub external_id: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub password_hash: String,
    pub email: String,
    pub phone: String,
    pub photo: Option<String>,
}

