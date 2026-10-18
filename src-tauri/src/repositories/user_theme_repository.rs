use rusqlite::{params, Connection, OptionalExtension};

use crate::models::user_theme::ThemePreference;

pub fn find_startup_preference(
    conn: &Connection,
) -> Result<Option<ThemePreference>, rusqlite::Error> {
    conn.query_row(
        "SELECT users.theme_preference FROM app_theme_state
         JOIN users ON users.id = app_theme_state.last_user_id
         WHERE app_theme_state.id = 1",
        [],
        |row| row.get(0),
    )
    .optional()
}

pub fn remember_last_user(conn: &Connection, user_id: i64) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_theme_state (id, last_user_id) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET last_user_id = excluded.last_user_id",
        [user_id],
    )?;
    Ok(())
}

pub fn find_by_user_id(
    conn: &Connection,
    user_id: i64,
) -> Result<Option<ThemePreference>, rusqlite::Error> {
    conn.query_row(
        "SELECT theme_preference FROM users WHERE id = ?1",
        params![user_id],
        |row| row.get(0),
    )
    .optional()
}

pub fn update(
    conn: &Connection,
    user_id: i64,
    theme: ThemePreference,
) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "UPDATE users SET theme_preference = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?2",
        params![theme.as_str(), user_id],
    )
}
