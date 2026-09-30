use rusqlite::{params, Connection, OptionalExtension};
use crate::models::company::Company;

pub const SELECT_COMPANY_FIELDS: &str = "id, external_id, legal_name, trade_name, cnpj, department, email, phone, street, neighborhood, number, city, state, zipcode, country, active, created_at, updated_at, deleted_at";

pub fn map_company_row(row: &rusqlite::Row<'_>) -> Result<Company, rusqlite::Error> {
    let active_int: i32 = row.get(15)?;

    Ok(Company {
        id: row.get(0)?,
        external_id: row.get(1)?,
        legal_name: row.get(2)?,
        trade_name: row.get(3)?,
        cnpj: row.get(4)?,
        department: row.get(5)?,
        email: row.get(6)?,
        phone: row.get(7)?,
        street: row.get(8)?,
        neighborhood: row.get(9)?,
        number: row.get(10)?,
        city: row.get(11)?,
        state: row.get(12)?,
        zipcode: row.get(13)?,
        country: row.get(14)?,
        active: active_int != 0,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
        deleted_at: row.get(18)?,
    })
}

pub fn find_all(conn: &Connection) -> Result<Vec<Company>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM companies ORDER BY datetime(created_at) DESC, id DESC",
        SELECT_COMPANY_FIELDS
    );

    let mut stmt = conn.prepare(&query)?;
    let company_iter = stmt.query_map([], |row| map_company_row(row))?;

    let mut companies = Vec::new();
    for company in company_iter {
        companies.push(company?);
    }

    Ok(companies)
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<Company>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM companies WHERE id = ?1",
        SELECT_COMPANY_FIELDS
    );

    conn.query_row(&query, params![id], |row| map_company_row(row))
        .optional()
}

pub fn find_by_cnpj(conn: &Connection, cnpj: &str) -> Result<Option<Company>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM companies WHERE cnpj = ?1",
        SELECT_COMPANY_FIELDS
    );

    conn.query_row(&query, params![cnpj], |row| map_company_row(row))
        .optional()
}

pub fn insert(conn: &Connection, company: &Company) -> Result<(), rusqlite::Error> {
    let active_int = if company.active { 1 } else { 0 };

    conn.execute(
        "INSERT INTO companies (
            id, external_id, legal_name, trade_name, cnpj, department,
            email, phone, street, neighborhood, number, city, state,
            zipcode, country, active, created_at, updated_at, deleted_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![
            company.id,
            company.external_id,
            company.legal_name,
            company.trade_name,
            company.cnpj,
            company.department,
            company.email,
            company.phone,
            company.street,
            company.neighborhood,
            company.number,
            company.city,
            company.state,
            company.zipcode,
            company.country,
            active_int,
            company.created_at,
            company.updated_at,
            company.deleted_at,
        ],
    )?;

    Ok(())
}

pub fn update(conn: &Connection, company: &Company) -> Result<usize, rusqlite::Error> {
    let active_int = if company.active { 1 } else { 0 };

    conn.execute(
        "UPDATE companies SET
            external_id = ?1,
            legal_name = ?2,
            trade_name = ?3,
            cnpj = ?4,
            department = ?5,
            email = ?6,
            phone = ?7,
            street = ?8,
            neighborhood = ?9,
            number = ?10,
            city = ?11,
            state = ?12,
            zipcode = ?13,
            country = ?14,
            active = ?15,
            updated_at = ?16,
            deleted_at = ?17
        WHERE id = ?18",
        params![
            company.external_id,
            company.legal_name,
            company.trade_name,
            company.cnpj,
            company.department,
            company.email,
            company.phone,
            company.street,
            company.neighborhood,
            company.number,
            company.city,
            company.state,
            company.zipcode,
            company.country,
            active_int,
            company.updated_at,
            company.deleted_at,
            company.id,
        ],
    )
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute("DELETE FROM companies WHERE id = ?1", params![id])
}

pub fn soft_delete(conn: &Connection, id: &str, deleted_at: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "UPDATE companies SET deleted_at = ?1, active = 0, updated_at = ?1 WHERE id = ?2",
        params![deleted_at, id],
    )
}
