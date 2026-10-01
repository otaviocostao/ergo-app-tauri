use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::workspace::{
    CreateWorkspacePayload, DeviceType, UpdateWorkspacePayload, Workspace,
};
use crate::repositories::workspace_repository;

pub fn get_workspaces(conn: &Connection) -> Result<Vec<Workspace>, String> {
    workspace_repository::find_all(conn).map_err(|e| e.to_string())
}

pub fn get_workspace_by_id(conn: &Connection, id: &str) -> Result<Workspace, String> {
    workspace_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Workspace with id '{}' not found", id))
}

pub fn create_workspace(
    conn: &Connection,
    payload: CreateWorkspacePayload,
) -> Result<Workspace, String> {
    let workspace_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let workspace = Workspace {
        id: workspace_id,
        device_type: payload.device_type.unwrap_or(DeviceType::Desktop),
        is_webcam_front: payload.is_webcam_front.unwrap_or(true),
        has_external_keyboard: payload.has_external_keyboard.unwrap_or(true),
        has_external_mouse: payload.has_external_mouse.unwrap_or(true),
        adjustable_desk: payload.adjustable_desk.unwrap_or(false),
        adjustable_chair: payload.adjustable_chair.unwrap_or(true),
        adjustable_monitor: payload.adjustable_monitor.unwrap_or(true),
        created_at: Some(now.clone()),
        updated_at: Some(now),
    };

    workspace_repository::insert(conn, &workspace).map_err(|e| e.to_string())?;

    Ok(workspace)
}

pub fn update_workspace(
    conn: &Connection,
    payload: UpdateWorkspacePayload,
) -> Result<Workspace, String> {
    let existing_workspace = workspace_repository::find_by_id(conn, &payload.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Workspace with id '{}' not found", payload.id))?;

    let now = Utc::now().to_rfc3339();

    let updated_workspace = Workspace {
        id: payload.id,
        device_type: payload.device_type.unwrap_or(existing_workspace.device_type),
        is_webcam_front: payload
            .is_webcam_front
            .unwrap_or(existing_workspace.is_webcam_front),
        has_external_keyboard: payload
            .has_external_keyboard
            .unwrap_or(existing_workspace.has_external_keyboard),
        has_external_mouse: payload
            .has_external_mouse
            .unwrap_or(existing_workspace.has_external_mouse),
        adjustable_desk: payload
            .adjustable_desk
            .unwrap_or(existing_workspace.adjustable_desk),
        adjustable_chair: payload
            .adjustable_chair
            .unwrap_or(existing_workspace.adjustable_chair),
        adjustable_monitor: payload
            .adjustable_monitor
            .unwrap_or(existing_workspace.adjustable_monitor),
        created_at: existing_workspace.created_at,
        updated_at: Some(now),
    };

    workspace_repository::update(conn, &updated_workspace).map_err(|e| e.to_string())?;

    Ok(updated_workspace)
}

pub fn delete_workspace(conn: &Connection, id: &str) -> Result<bool, String> {
    let rows_affected = workspace_repository::delete(conn, id).map_err(|e| e.to_string())?;
    Ok(rows_affected > 0)
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
    fn test_workspace_crud_lifecycle() {
        let conn = setup_test_db();

        // 1. Create workspace
        let create_payload = CreateWorkspacePayload {
            device_type: Some(DeviceType::Notebook),
            is_webcam_front: Some(false),
            has_external_keyboard: Some(true),
            has_external_mouse: Some(true),
            adjustable_desk: Some(true),
            adjustable_chair: Some(true),
            adjustable_monitor: Some(false),
        };

        let created = create_workspace(&conn, create_payload).expect("Failed to create workspace");
        assert_eq!(created.device_type, DeviceType::Notebook);
        assert!(!created.is_webcam_front);
        assert!(created.has_external_keyboard);
        assert!(created.has_external_mouse);
        assert!(created.adjustable_desk);
        assert!(created.adjustable_chair);
        assert!(!created.adjustable_monitor);
        assert!(created.created_at.is_some());
        assert!(created.updated_at.is_some());

        // 2. Get by ID
        let fetched = get_workspace_by_id(&conn, &created.id).expect("Failed to get workspace by id");
        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.device_type, DeviceType::Notebook);

        // 3. Get all
        let all = get_workspaces(&conn).expect("Failed to list workspaces");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, created.id);

        // 4. Update workspace
        let update_payload = UpdateWorkspacePayload {
            id: created.id.clone(),
            device_type: Some(DeviceType::Desktop),
            is_webcam_front: Some(true),
            has_external_keyboard: None,
            has_external_mouse: None,
            adjustable_desk: Some(false),
            adjustable_chair: None,
            adjustable_monitor: Some(true),
        };

        let updated = update_workspace(&conn, update_payload).expect("Failed to update workspace");
        assert_eq!(updated.device_type, DeviceType::Desktop);
        assert!(updated.is_webcam_front);
        assert!(updated.has_external_keyboard); // Preserved from previous
        assert!(!updated.adjustable_desk);
        assert!(updated.adjustable_monitor);

        // 5. Delete workspace
        let deleted = delete_workspace(&conn, &created.id).expect("Failed to delete workspace");
        assert!(deleted);

        // 6. Verify deleted
        let after_delete = get_workspace_by_id(&conn, &created.id);
        assert!(after_delete.is_err());
    }

    #[test]
    fn test_workspace_default_values() {
        let conn = setup_test_db();

        let create_payload = CreateWorkspacePayload {
            device_type: None,
            is_webcam_front: None,
            has_external_keyboard: None,
            has_external_mouse: None,
            adjustable_desk: None,
            adjustable_chair: None,
            adjustable_monitor: None,
        };

        let created = create_workspace(&conn, create_payload).expect("Failed to create workspace with defaults");
        assert_eq!(created.device_type, DeviceType::Desktop);
        assert!(created.is_webcam_front);
        assert!(created.has_external_keyboard);
        assert!(created.has_external_mouse);
        assert!(!created.adjustable_desk);
        assert!(created.adjustable_chair);
        assert!(created.adjustable_monitor);
    }

    #[test]
    fn test_workspace_not_found_errors() {
        let conn = setup_test_db();

        let non_existent_id = "non-existent-id-123";
        let err_get = get_workspace_by_id(&conn, non_existent_id);
        assert!(err_get.is_err());
        assert!(err_get.unwrap_err().contains("not found"));

        let update_payload = UpdateWorkspacePayload {
            id: non_existent_id.to_string(),
            device_type: Some(DeviceType::Desktop),
            is_webcam_front: None,
            has_external_keyboard: None,
            has_external_mouse: None,
            adjustable_desk: None,
            adjustable_chair: None,
            adjustable_monitor: None,
        };
        let err_update = update_workspace(&conn, update_payload);
        assert!(err_update.is_err());
        assert!(err_update.unwrap_err().contains("not found"));

        let deleted = delete_workspace(&conn, non_existent_id).expect("Delete non-existent should succeed with false");
        assert!(!deleted);
    }
}
