use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Company {
    pub id: String,
    pub external_id: Option<String>,
    pub legal_name: Option<String>,
    pub trade_name: Option<String>,
    pub cnpj: Option<String>,
    pub department: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub street: Option<String>,
    pub neighborhood: Option<String>,
    pub number: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zipcode: Option<String>,
    pub country: Option<String>,
    pub active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCompanyPayload {
    pub id: Option<String>,
    pub external_id: Option<String>,
    pub legal_name: Option<String>,
    pub trade_name: Option<String>,
    pub cnpj: Option<String>,
    pub department: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub street: Option<String>,
    pub neighborhood: Option<String>,
    pub number: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zipcode: Option<String>,
    pub country: Option<String>,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCompanyPayload {
    pub id: String,
    pub external_id: Option<String>,
    pub legal_name: Option<String>,
    pub trade_name: Option<String>,
    pub cnpj: Option<String>,
    pub department: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub street: Option<String>,
    pub neighborhood: Option<String>,
    pub number: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zipcode: Option<String>,
    pub country: Option<String>,
    pub active: Option<bool>,
    pub deleted_at: Option<String>,
}
