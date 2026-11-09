use rusqlite::{params, Connection, OptionalExtension};

use crate::models::settings::Settings;

pub const SELECT_SETTINGS_FIELDS: &str =
    "id, user_id, postural_analysis, ocular_analysis, typing_analysis, web_cam, created_at, updated_at";

pub fn map_settings_row(row: &rusqlite::Row<'_>) -> Result<Settings, rusqlite::Error> {
    Ok(Settings {
        id: row.get(0)?,
        user_id: row.get(1)?,
        postural_analysis: row.get::<_, i32>(2)? != 0,
        ocular_analysis: row.get::<_, i32>(3)? != 0,
        typing_analysis: row.get::<_, i32>(4)? != 0,
        web_cam: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn find_by_user_id(
    conn: &Connection,
    user_id: &str,
) -> Result<Option<Settings>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM settings WHERE user_id = ?1",
        SELECT_SETTINGS_FIELDS
    );
    conn.query_row(&query, params![user_id], map_settings_row)
        .optional()
}

/// Creates the user's row with every module enabled; an existing row is kept.
pub fn insert(conn: &Connection, id: &str, user_id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "INSERT INTO settings (id, user_id) VALUES (?1, ?2) ON CONFLICT(user_id) DO NOTHING",
        params![id, user_id],
    )
}

pub fn update(conn: &Connection, settings: &Settings) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "UPDATE settings SET
            postural_analysis = ?1,
            ocular_analysis = ?2,
            typing_analysis = ?3,
            web_cam = ?4,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE user_id = ?5",
        params![
            settings.postural_analysis as i32,
            settings.ocular_analysis as i32,
            settings.typing_analysis as i32,
            settings.web_cam,
            settings.user_id,
        ],
    )
}

pub fn delete(conn: &Connection, user_id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute("DELETE FROM settings WHERE user_id = ?1", params![user_id])
}
