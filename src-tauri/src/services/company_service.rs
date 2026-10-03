use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::company::{Company, CreateCompanyPayload, UpdateCompanyPayload};
use crate::repositories::company_repository;

pub fn validate_company(
    cnpj: Option<&str>,
    email: Option<&str>,
    phone: Option<&str>,
) -> Result<(), String> {
    if let Some(c) = cnpj {
        let trimmed = c.trim();
        if !trimmed.is_empty() {
            let digits_only: String = trimmed.chars().filter(|ch| ch.is_ascii_digit()).collect();
            if digits_only.len() > 14 {
                return Err("CNPJ cannot exceed 14 digits".to_string());
            }
        }
    }

    if let Some(e) = email {
        let trimmed = e.trim();
        if !trimmed.is_empty() && (!trimmed.contains('@') || !trimmed.contains('.')) {
            return Err(format!("Invalid email format: '{}'", trimmed));
        }
    }

    if let Some(p) = phone {
        let trimmed = p.trim();
        if trimmed.len() > 30 {
            return Err("Phone number cannot exceed 30 characters".to_string());
        }
    }

    Ok(())
}

pub fn get_companies(conn: &Connection) -> Result<Vec<Company>, String> {
    company_repository::find_all(conn).map_err(|e| e.to_string())
}

pub fn get_company_by_id(conn: &Connection, id: &str) -> Result<Company, String> {
    company_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Company with id '{}' not found", id))
}

pub fn create_company(
    conn: &Connection,
    payload: CreateCompanyPayload,
) -> Result<Company, String> {
    validate_company(
        payload.cnpj.as_deref(),
        payload.email.as_deref(),
        payload.phone.as_deref(),
    )?;

    let company_id = payload
        .id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let now = Utc::now().to_rfc3339();
    let active = payload.active.unwrap_or(true);

    let company = Company {
        id: company_id,
        external_id: payload.external_id,
        legal_name: payload.legal_name,
        trade_name: payload.trade_name,
        cnpj: payload.cnpj,
        department: payload.department,
        email: payload.email,
        phone: payload.phone,
        street: payload.street,
        neighborhood: payload.neighborhood,
        number: payload.number,
        city: payload.city,
        state: payload.state,
        zipcode: payload.zipcode,
        country: payload.country,
        active,
        created_at: Some(now.clone()),
        updated_at: Some(now),
        deleted_at: None,
    };

    company_repository::insert(conn, &company).map_err(|e| e.to_string())?;

    Ok(company)
}

pub fn update_company(
    conn: &Connection,
    payload: UpdateCompanyPayload,
) -> Result<Company, String> {
    validate_company(
        payload.cnpj.as_deref(),
        payload.email.as_deref(),
        payload.phone.as_deref(),
    )?;

    let existing = company_repository::find_by_id(conn, &payload.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Company with id '{}' not found", payload.id))?;

    let now = Utc::now().to_rfc3339();

    let updated_company = Company {
        id: payload.id,
        external_id: payload.external_id.or(existing.external_id),
        legal_name: payload.legal_name.or(existing.legal_name),
        trade_name: payload.trade_name.or(existing.trade_name),
        cnpj: payload.cnpj.or(existing.cnpj),
        department: payload.department.or(existing.department),
        email: payload.email.or(existing.email),
        phone: payload.phone.or(existing.phone),
        street: payload.street.or(existing.street),
        neighborhood: payload.neighborhood.or(existing.neighborhood),
        number: payload.number.or(existing.number),
        city: payload.city.or(existing.city),
        state: payload.state.or(existing.state),
        zipcode: payload.zipcode.or(existing.zipcode),
        country: payload.country.or(existing.country),
        active: payload.active.unwrap_or(existing.active),
        created_at: existing.created_at,
        updated_at: Some(now),
        deleted_at: payload.deleted_at.or(existing.deleted_at),
    };

    company_repository::update(conn, &updated_company).map_err(|e| e.to_string())?;

    Ok(updated_company)
}

pub fn delete_company(conn: &Connection, id: &str) -> Result<bool, String> {
    let rows_affected = company_repository::delete(conn, id).map_err(|e| e.to_string())?;
    Ok(rows_affected > 0)
}

pub fn soft_delete_company(conn: &Connection, id: &str) -> Result<Company, String> {
    let mut company = company_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Company with id '{}' not found", id))?;

    let now = Utc::now().to_rfc3339();
    company_repository::soft_delete(conn, id, &now).map_err(|e| e.to_string())?;

    company.active = false;
    company.deleted_at = Some(now.clone());
    company.updated_at = Some(now);

    Ok(company)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn
    }

    #[test]
    fn test_company_crud_lifecycle() {
        let conn = setup_test_db();

        // 1. Create company with all fields nullable (empty payload)
        let minimal_payload = CreateCompanyPayload {
            id: None,
            external_id: None,
            legal_name: None,
            trade_name: None,
            cnpj: None,
            department: None,
            email: None,
            phone: None,
            street: None,
            neighborhood: None,
            number: None,
            city: None,
            state: None,
            zipcode: None,
            country: None,
            active: None,
        };

        let created_minimal = create_company(&conn, minimal_payload).unwrap();
        assert!(!created_minimal.id.is_empty());
        assert!(created_minimal.active);
        assert!(created_minimal.created_at.is_some());
        assert!(created_minimal.legal_name.is_none());

        // 2. Create company with full fields
        let full_payload = CreateCompanyPayload {
            id: Some("11111111-1111-1111-1111-111111111111".to_string()),
            external_id: Some("22222222-2222-2222-2222-222222222222".to_string()),
            legal_name: Some("Acme Corporation Ltda".to_string()),
            trade_name: Some("Acme Corp".to_string()),
            cnpj: Some("12345678000195".to_string()),
            department: Some("Engenharia".to_string()),
            email: Some("contact@acme.com".to_string()),
            phone: Some("+5511999999999".to_string()),
            street: Some("Avenida Paulista".to_string()),
            neighborhood: Some("Bela Vista".to_string()),
            number: Some("1000".to_string()),
            city: Some("São Paulo".to_string()),
            state: Some("SP".to_string()),
            zipcode: Some("01310-100".to_string()),
            country: Some("Brasil".to_string()),
            active: Some(true),
        };

        let created_full = create_company(&conn, full_payload).unwrap();
        assert_eq!(created_full.id, "11111111-1111-1111-1111-111111111111");
        assert_eq!(created_full.legal_name.as_deref(), Some("Acme Corporation Ltda"));
        assert_eq!(created_full.cnpj.as_deref(), Some("12345678000195"));

        // 3. Read by ID
        let fetched = get_company_by_id(&conn, &created_full.id).unwrap();
        assert_eq!(fetched.trade_name.as_deref(), Some("Acme Corp"));
        assert_eq!(fetched.city.as_deref(), Some("São Paulo"));

        // 4. Update company
        let update_payload = UpdateCompanyPayload {
            id: created_full.id.clone(),
            external_id: None,
            legal_name: Some("Acme Global Inc".to_string()),
            trade_name: None,
            cnpj: None,
            department: Some("Tecnologia da Informação".to_string()),
            email: None,
            phone: None,
            street: None,
            neighborhood: None,
            number: None,
            city: None,
            state: None,
            zipcode: None,
            country: None,
            active: Some(false),
            deleted_at: None,
        };

        let updated = update_company(&conn, update_payload).unwrap();
        assert_eq!(updated.legal_name.as_deref(), Some("Acme Global Inc"));
        assert_eq!(updated.trade_name.as_deref(), Some("Acme Corp")); // Preserved
        assert_eq!(updated.department.as_deref(), Some("Tecnologia da Informação"));
        assert!(!updated.active);

        // 5. List all companies
        let list = get_companies(&conn).unwrap();
        assert_eq!(list.len(), 2);

        // 6. Soft delete
        let soft_deleted = soft_delete_company(&conn, &created_minimal.id).unwrap();
        assert!(!soft_deleted.active);
        assert!(soft_deleted.deleted_at.is_some());

        // 7. Hard delete
        let deleted = delete_company(&conn, &created_full.id).unwrap();
        assert!(deleted);

        // 8. Verify not found
        let err = get_company_by_id(&conn, &created_full.id);
        assert!(err.is_err());
    }

    #[test]
    fn test_company_validations() {
        assert!(validate_company(Some("12345678000195"), Some("test@example.com"), Some("123456")).is_ok());
        assert!(validate_company(None, None, None).is_ok());

        // CNPJ too long
        let err_cnpj = validate_company(Some("123456789012345"), None, None);
        assert!(err_cnpj.is_err());
        assert!(err_cnpj.unwrap_err().contains("CNPJ cannot exceed 14 digits"));

        // Invalid email
        let err_email = validate_company(None, Some("invalid-email"), None);
        assert!(err_email.is_err());
        assert!(err_email.unwrap_err().contains("Invalid email format"));

        // Phone too long
        let err_phone = validate_company(None, None, Some("01234567890123456789012345678901"));
        assert!(err_phone.is_err());
        assert!(err_phone.unwrap_err().contains("Phone number cannot exceed 30 characters"));
    }
}
