use rusqlite::{params, Connection, OptionalExtension};
use crate::models::workspace::Workspace;

pub const SELECT_WORKSPACE_FIELDS: &str = "id, device_type, is_webcam_front, has_external_keyboard, has_external_mouse, adjustable_desk, adjustable_chair, adjustable_monitor, created_at, updated_at";

pub fn map_workspace_row(row: &rusqlite::Row<'_>) -> Result<Workspace, rusqlite::Error> {
    let is_webcam_front_int: i32 = row.get(2)?;
    let has_external_keyboard_int: i32 = row.get(3)?;
    let has_external_mouse_int: i32 = row.get(4)?;
    let adjustable_desk_int: i32 = row.get(5)?;
    let adjustable_chair_int: i32 = row.get(6)?;
    let adjustable_monitor_int: i32 = row.get(7)?;

    Ok(Workspace {
        id: row.get(0)?,
        device_type: row.get(1)?,
        is_webcam_front: is_webcam_front_int != 0,
        has_external_keyboard: has_external_keyboard_int != 0,
        has_external_mouse: has_external_mouse_int != 0,
        adjustable_desk: adjustable_desk_int != 0,
        adjustable_chair: adjustable_chair_int != 0,
        adjustable_monitor: adjustable_monitor_int != 0,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

pub fn find_all(conn: &Connection) -> Result<Vec<Workspace>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM workspaces ORDER BY datetime(created_at) DESC, id DESC",
        SELECT_WORKSPACE_FIELDS
    );

    let mut stmt = conn.prepare(&query)?;
    let workspace_iter = stmt.query_map([], |row| map_workspace_row(row))?;

    let mut workspaces = Vec::new();
    for workspace in workspace_iter {
        workspaces.push(workspace?);
    }

    Ok(workspaces)
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<Workspace>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM workspaces WHERE id = ?1",
        SELECT_WORKSPACE_FIELDS
    );

    conn.query_row(&query, params![id], |row| map_workspace_row(row))
        .optional()
}

pub fn insert(conn: &Connection, workspace: &Workspace) -> Result<(), rusqlite::Error> {
    let is_webcam_front_int = if workspace.is_webcam_front { 1 } else { 0 };
    let has_external_keyboard_int = if workspace.has_external_keyboard { 1 } else { 0 };
    let has_external_mouse_int = if workspace.has_external_mouse { 1 } else { 0 };
    let adjustable_desk_int = if workspace.adjustable_desk { 1 } else { 0 };
    let adjustable_chair_int = if workspace.adjustable_chair { 1 } else { 0 };
    let adjustable_monitor_int = if workspace.adjustable_monitor { 1 } else { 0 };

    conn.execute(
        "INSERT INTO workspaces (
            id, device_type, is_webcam_front, has_external_keyboard,
            has_external_mouse, adjustable_desk, adjustable_chair, adjustable_monitor,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            workspace.id,
            workspace.device_type,
            is_webcam_front_int,
            has_external_keyboard_int,
            has_external_mouse_int,
            adjustable_desk_int,
            adjustable_chair_int,
            adjustable_monitor_int,
            workspace.created_at,
            workspace.updated_at,
        ],
    )?;

    Ok(())
}

pub fn update(conn: &Connection, workspace: &Workspace) -> Result<usize, rusqlite::Error> {
    let is_webcam_front_int = if workspace.is_webcam_front { 1 } else { 0 };
    let has_external_keyboard_int = if workspace.has_external_keyboard { 1 } else { 0 };
    let has_external_mouse_int = if workspace.has_external_mouse { 1 } else { 0 };
    let adjustable_desk_int = if workspace.adjustable_desk { 1 } else { 0 };
    let adjustable_chair_int = if workspace.adjustable_chair { 1 } else { 0 };
    let adjustable_monitor_int = if workspace.adjustable_monitor { 1 } else { 0 };

    conn.execute(
        "UPDATE workspaces SET
            device_type = ?1,
            is_webcam_front = ?2,
            has_external_keyboard = ?3,
            has_external_mouse = ?4,
            adjustable_desk = ?5,
            adjustable_chair = ?6,
            adjustable_monitor = ?7,
            updated_at = ?8
        WHERE id = ?9",
        params![
            workspace.device_type,
            is_webcam_front_int,
            has_external_keyboard_int,
            has_external_mouse_int,
            adjustable_desk_int,
            adjustable_chair_int,
            adjustable_monitor_int,
            workspace.updated_at,
            workspace.id,
        ],
    )
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])
}
