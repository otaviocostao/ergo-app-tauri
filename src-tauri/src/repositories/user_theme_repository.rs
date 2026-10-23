use rusqlite::{params, Connection, OptionalExtension};

use crate::models::user_theme::ThemePreference;

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
        params![theme, user_id],
    )
}
