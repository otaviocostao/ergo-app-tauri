use serde::Serialize;

use crate::models::user::User;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Session {
    #[default]
    Anonymous,
    Guest,
    Authenticated {
        user: Box<User>,
    },
}

#[derive(Clone, Debug, Serialize)]
pub struct AuthError {
    pub code: &'static str,
    pub message: &'static str,
}

impl AuthError {
    pub fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    pub fn internal() -> Self {
        Self::new(
            "internal",
            "Não foi possível acessar sua conta. Tente novamente.",
        )
    }

    pub fn invalid_credentials() -> Self {
        Self::new("invalid_credentials", "E-mail ou senha incorretos.")
    }
}
