use rusqlite::{params, Connection, OptionalExtension};

use crate::models::user::{NewUser, StoredUser, User};

pub const SELECT_USER_FIELDS: &str = "id, external_id, first_name, last_name, birth_date, password_hash, email, phone, photo, created_at, updated_at";

fn map_user_row(row: &rusqlite::Row<'_>) -> Result<StoredUser, rusqlite::Error> {
    Ok(StoredUser {
        user: User {
            id: row.get(0)?,
            external_id: row.get(1)?,
            first_name: row.get(2)?,
            last_name: row.get(3)?,
            birth_date: row.get(4)?,
            email: row.get(6)?,
            phone: row.get(7)?,
            photo: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        },
        password_hash: row.get(5)?,
    })
}

pub fn find_by_id(conn: &Connection, id: i64) -> Result<Option<StoredUser>, rusqlite::Error> {
    let query = format!("SELECT {} FROM users WHERE id = ?1", SELECT_USER_FIELDS);
    conn.query_row(&query, params![id], map_user_row).optional()
}

pub fn find_by_email(
    conn: &Connection,
    email: &str,
) -> Result<Option<StoredUser>, rusqlite::Error> {
    let query = format!("SELECT {} FROM users WHERE email = ?1", SELECT_USER_FIELDS);
    conn.query_row(&query, params![email], map_user_row)
        .optional()
}

pub fn insert(conn: &Connection, user: &NewUser) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT INTO users (
            external_id, first_name, last_name, birth_date, password_hash,
            email, phone, photo
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            user.external_id,
            user.first_name,
            user.last_name,
            user.birth_date,
            user.password_hash,
            user.email,
            user.phone,
            user.photo,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update(
    conn: &Connection,
    id: i64,
    first_name: &str,
    last_name: &str,
    birth_date: &str,
    email: &str,
    phone: &str,
    photo: Option<&str>,
) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "UPDATE users SET
            first_name = ?1,
            last_name = ?2,
            birth_date = ?3,
            email = ?4,
            phone = ?5,
            photo = ?6,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?7",
        params![
            first_name,
            last_name,
            birth_date,
            email,
            phone,
            photo,
            id,
        ],
    )
}

#[cfg(test)]
pub fn count(conn: &Connection) -> Result<i64, rusqlite::Error> {
    conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
}

