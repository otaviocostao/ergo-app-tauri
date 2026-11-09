use rusqlite::Connection;
use uuid::Uuid;

use crate::models::settings::{
    Module, SetModuleEnabledPayload, Settings, UpdateSettingsPayload, WEB_CAM_MAX_LENGTH,
};
use crate::repositories::settings_repository;
use crate::services::auth_service::AuthState;
use crate::services::reminder_service;

const AUTHENTICATION_REQUIRED: &str = "Authentication is required to manage settings";

/// Accounts get their row on first use, with every module enabled.
fn find_or_create(conn: &Connection, user_id: &str) -> Result<Settings, String> {
    settings_repository::insert(conn, &Uuid::new_v4().to_string(), user_id)
        .map_err(|error| error.to_string())?;
    settings_repository::find_by_user_id(conn, user_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Settings not found".to_string())
}

/// A missing row means the defaults, so every module is enabled.
pub fn is_module_enabled(conn: &Connection, user_id: &str, module: Module) -> Result<bool, String> {
    Ok(settings_repository::find_by_user_id(conn, user_id)
        .map_err(|error| error.to_string())?
        .is_none_or(|settings| settings.is_module_enabled(module)))
}

pub fn get_settings(conn: &Connection, auth_state: &AuthState) -> Result<Settings, String> {
    auth_state.with_authenticated_user(|user_id| {
        find_or_create(conn, user_id.ok_or(AUTHENTICATION_REQUIRED)?)
    })?
}

/// Browser device IDs are opaque, so they are stored as sent; only blank or oversized values are refused.
fn validate_web_cam(web_cam: &Option<String>) -> Result<(), String> {
    match web_cam {
        Some(id) if id.trim().is_empty() || id.len() > WEB_CAM_MAX_LENGTH => {
            Err("Invalid webcam identifier".to_string())
        }
        _ => Ok(()),
    }
}

/// Disabling a module also turns off the notices linked to it, in the same transaction.
pub fn update_settings(
    conn: &Connection,
    auth_state: &AuthState,
    payload: UpdateSettingsPayload,
) -> Result<Settings, String> {
    if payload
        .daily_goal_minutes
        .is_some_and(|minutes| !(1..=1440).contains(&minutes))
    {
        return Err("Daily posture goal must be between 1 and 1440 minutes".to_string());
    }
    if let Some(web_cam) = &payload.web_cam {
        validate_web_cam(web_cam)?;
    }
    auth_state.with_authenticated_user(|user_id| {
        let user_id = user_id.ok_or(AUTHENTICATION_REQUIRED)?;
        let transaction = conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        let mut settings = find_or_create(&transaction, user_id)?;
        if let Some(minutes) = payload.daily_goal_minutes {
            settings.daily_goal_minutes = minutes;
        }
        if let Some(web_cam) = payload.web_cam.clone() {
            settings.web_cam = web_cam;
        }
        for (module, enabled) in payload.changes() {
            settings.set_module_enabled(module, enabled);
            if !enabled {
                reminder_service::deactivate_module_reminders(&transaction, user_id, module)?;
            }
        }
        settings_repository::update(&transaction, &settings).map_err(|error| error.to_string())?;
        let updated = settings_repository::find_by_user_id(&transaction, user_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Settings not found".to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(updated)
    })?
}

pub fn set_module_enabled(
    conn: &Connection,
    auth_state: &AuthState,
    payload: SetModuleEnabledPayload,
) -> Result<Settings, String> {
    let mut changes = UpdateSettingsPayload::default();
    match payload.module {
        Module::PosturalAnalysis => changes.postural_analysis = Some(payload.enabled),
        Module::OcularAnalysis => changes.ocular_analysis = Some(payload.enabled),
        Module::TypingAnalysis => changes.typing_analysis = Some(payload.enabled),
    }
    update_settings(conn, auth_state, changes)
}

/// Removes the row, so the account returns to the defaults on its next read.
pub fn delete_settings(conn: &Connection, auth_state: &AuthState) -> Result<bool, String> {
    auth_state.with_authenticated_user(|user_id| {
        let user_id = user_id.ok_or(AUTHENTICATION_REQUIRED)?;
        settings_repository::delete(conn, user_id)
            .map(|deleted| deleted > 0)
            .map_err(|error| error.to_string())
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::auth::Session;
    use crate::models::reminder::{Reminder, SystemReminderType, UpdateReminderPayload};
    use crate::repositories::user_repository;
    use crate::services::auth_service;

    fn setup_database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn);
        conn
    }

    fn initialize_database(conn: &Connection) {
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    }

    fn authenticate(conn: &Connection, state: &AuthState, email: &str) -> String {
        let user_id = user_repository::find_by_email(conn, email)
            .unwrap()
            .map(|stored| stored.user.id)
            .unwrap_or_else(|| {
                let user_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
                     VALUES (?2, 'Test', 'User', '1995-05-20', 'test-hash', ?1, '75999999999')",
                    rusqlite::params![email, user_id],
                )
                .unwrap();
                user_id
            });
        let user = user_repository::find_by_id(conn, &user_id)
            .unwrap()
            .unwrap()
            .user;
        auth_service::set_session(
            state,
            Session::Authenticated {
                user: Box::new(user),
            },
        )
        .unwrap();
        reminder_service::ensure_system_reminders(conn, &user_id).unwrap();
        user_id
    }

    fn set(conn: &Connection, state: &AuthState, module: Module, enabled: bool) -> Settings {
        set_module_enabled(conn, state, SetModuleEnabledPayload { module, enabled }).unwrap()
    }

    fn set_status(
        conn: &Connection,
        state: &AuthState,
        id: &str,
        status: &str,
    ) -> Result<String, String> {
        let payload: UpdateReminderPayload =
            serde_json::from_value(serde_json::json!({ "id": id, "status": status })).unwrap();
        reminder_service::update_reminder(conn, state, payload).map(|reminder| reminder.status)
    }

    fn statuses(conn: &Connection, state: &AuthState) -> Vec<(Option<SystemReminderType>, String)> {
        reminder_service::get_reminders(conn, state)
            .unwrap()
            .into_iter()
            .map(|reminder| (reminder.system_type, reminder.status))
            .collect()
    }

    fn activate_all_notices(conn: &Connection, state: &AuthState, user_id: &str) {
        for kind in SystemReminderType::ALL {
            set_status(conn, state, &kind.reminder_id(user_id), "ativo").unwrap();
        }
    }

    #[test]
    fn new_accounts_start_with_every_module_enabled() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = authenticate(&conn, &state, "owner@example.com");
        for module in Module::ALL {
            assert!(is_module_enabled(&conn, &user_id, module).unwrap());
        }
        assert!(settings_repository::find_by_user_id(&conn, &user_id)
            .unwrap()
            .is_none());

        let settings = get_settings(&conn, &state).unwrap();
        assert_eq!(settings.user_id, user_id);
        assert_eq!(get_settings(&conn, &state).unwrap(), settings);
        let json = serde_json::to_value(&settings).unwrap();
        assert_eq!(json["posturalAnalysis"], true);
        assert_eq!(json["ocularAnalysis"], true);
        assert_eq!(json["typingAnalysis"], true);
        for module in Module::ALL {
            assert!(settings.is_module_enabled(module));
            assert_eq!(serde_json::to_value(module).unwrap(), module.as_str());
        }
    }

    #[test]
    fn modules_are_toggled_individually_and_through_the_full_update() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = authenticate(&conn, &state, "owner@example.com");
        let typing_off = set(&conn, &state, Module::TypingAnalysis, false);
        assert!(!typing_off.is_module_enabled(Module::TypingAnalysis));
        assert!(typing_off.is_module_enabled(Module::PosturalAnalysis));
        assert!(!is_module_enabled(&conn, &user_id, Module::TypingAnalysis).unwrap());

        let payload: UpdateSettingsPayload = serde_json::from_value(serde_json::json!({
            "posturalAnalysis": false, "ocularAnalysis": false, "typingAnalysis": true
        }))
        .unwrap();
        let updated = update_settings(&conn, &state, payload).unwrap();
        assert_eq!(
            Module::ALL.map(|module| updated.is_module_enabled(module)),
            [false, false, true]
        );
        assert_eq!(get_settings(&conn, &state).unwrap(), updated);

        assert!(delete_settings(&conn, &state).unwrap());
        assert!(!delete_settings(&conn, &state).unwrap());
        assert!(Module::ALL
            .iter()
            .all(|&module| is_module_enabled(&conn, &user_id, module).unwrap()));
        assert!(get_settings(&conn, &state)
            .unwrap()
            .is_module_enabled(Module::OcularAnalysis));
    }

    fn create_custom(
        conn: &Connection,
        state: &AuthState,
        category: &str,
        status: &str,
    ) -> Result<Reminder, String> {
        reminder_service::create_reminder(
            conn,
            state,
            serde_json::from_value(serde_json::json!({
                "title": category, "message": "Custom reminder", "category": category,
                "interval": 60, "period": "08:00 - 18:00", "frequency": "DAILY",
                "startTime": "08:00", "endTime": "18:00", "status": status
            }))
            .unwrap(),
        )
    }

    fn custom_statuses(conn: &Connection, state: &AuthState) -> Vec<(String, String)> {
        let mut customs: Vec<_> = reminder_service::get_reminders(conn, state)
            .unwrap()
            .into_iter()
            .filter(|reminder| reminder.system_type.is_none())
            .map(|reminder| (reminder.category, reminder.status))
            .collect();
        customs.sort();
        customs
    }

    const CATEGORIES: [&str; 4] = ["Exercício", "Hidratação", "Pausa Visual", "Postura"];

    #[test]
    fn disabling_a_module_turns_off_its_notices_and_custom_reminders_of_its_categories() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = authenticate(&conn, &state, "owner@example.com");
        for category in CATEGORIES {
            create_custom(&conn, &state, category, "ativo").unwrap();
        }
        activate_all_notices(&conn, &state, &user_id);

        set(&conn, &state, Module::TypingAnalysis, false);
        assert!(statuses(&conn, &state)
            .iter()
            .all(|(_, status)| status == "ativo"));

        set(&conn, &state, Module::PosturalAnalysis, false);
        assert_eq!(
            statuses(&conn, &state)[..3],
            [
                (Some(SystemReminderType::PostureCheck), "inativo".into()),
                (Some(SystemReminderType::VisualBreak), "ativo".into()),
                (Some(SystemReminderType::MovementBreak), "inativo".into()),
            ]
        );
        let expected = |statuses: [&str; 4]| -> Vec<(String, String)> {
            CATEGORIES
                .iter()
                .zip(statuses)
                .map(|(category, status)| (category.to_string(), status.to_string()))
                .collect()
        };
        assert_eq!(
            custom_statuses(&conn, &state),
            expected(["inativo", "ativo", "ativo", "inativo"])
        );

        set(&conn, &state, Module::OcularAnalysis, false);
        assert_eq!(
            statuses(&conn, &state)[1],
            (Some(SystemReminderType::VisualBreak), "inativo".into())
        );
        assert_eq!(
            custom_statuses(&conn, &state),
            expected(["inativo", "ativo", "inativo", "inativo"])
        );
    }

    #[test]
    fn custom_reminders_of_a_disabled_module_cannot_be_activated() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        authenticate(&conn, &state, "owner@example.com");
        let hydration = create_custom(&conn, &state, "Hidratação", "ativo").unwrap();
        let exercise = create_custom(&conn, &state, "Exercício", "ativo").unwrap();
        set(&conn, &state, Module::PosturalAnalysis, false);

        let error = create_custom(&conn, &state, "Postura", "ativo").unwrap_err();
        assert!(
            error.contains("postural_analysis module is disabled"),
            "{error}"
        );
        let inactive = create_custom(&conn, &state, "Postura", "inativo").unwrap();
        assert_eq!(inactive.status, "inativo");
        assert!(set_status(&conn, &state, &exercise.id, "ativo").is_err());
        assert!(reminder_service::toggle_reminder_status(&conn, &state, &inactive.id).is_err());

        let moved: UpdateReminderPayload = serde_json::from_value(
            serde_json::json!({ "id": hydration.id, "category": "Postura" }),
        )
        .unwrap();
        assert!(reminder_service::update_reminder(&conn, &state, moved).is_err());
        assert_eq!(
            reminder_service::get_reminder_by_id(&conn, &state, &hydration.id).unwrap(),
            hydration
        );
        let moved_off: UpdateReminderPayload = serde_json::from_value(
            serde_json::json!({ "id": hydration.id, "category": "Postura", "status": "inativo" }),
        )
        .unwrap();
        assert_eq!(
            reminder_service::update_reminder(&conn, &state, moved_off)
                .unwrap()
                .category,
            "Postura"
        );
        assert!(create_custom(&conn, &state, "Hidratação", "ativo").is_ok());

        set(&conn, &state, Module::PosturalAnalysis, true);
        assert_eq!(
            set_status(&conn, &state, &exercise.id, "ativo").unwrap(),
            "ativo"
        );
    }

    #[test]
    fn notices_of_a_disabled_module_stay_off_until_it_is_enabled_again() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = authenticate(&conn, &state, "owner@example.com");
        activate_all_notices(&conn, &state, &user_id);
        set(&conn, &state, Module::OcularAnalysis, false);
        let visual = SystemReminderType::VisualBreak.reminder_id(&user_id);
        let posture = SystemReminderType::PostureCheck.reminder_id(&user_id);

        let error = set_status(&conn, &state, &visual, "ativo").unwrap_err();
        assert!(
            error.contains("ocular_analysis module is disabled"),
            "{error}"
        );
        assert!(reminder_service::toggle_reminder_status(&conn, &state, &visual).is_err());
        assert_eq!(
            set_status(&conn, &state, &visual, "inativo").unwrap(),
            "inativo"
        );
        assert_eq!(
            set_status(&conn, &state, &posture, "inativo").unwrap(),
            "inativo"
        );
        assert_eq!(
            set_status(&conn, &state, &posture, "ativo").unwrap(),
            "ativo"
        );

        set(&conn, &state, Module::OcularAnalysis, true);
        assert_eq!(
            reminder_service::get_reminder_by_id(&conn, &state, &visual)
                .unwrap()
                .status,
            "inativo"
        );
        assert_eq!(
            set_status(&conn, &state, &visual, "ativo").unwrap(),
            "ativo"
        );
    }

    #[test]
    fn a_failed_notice_update_rolls_back_the_module_change() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = authenticate(&conn, &state, "owner@example.com");
        activate_all_notices(&conn, &state, &user_id);
        get_settings(&conn, &state).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER block_notice_updates BEFORE UPDATE ON reminders
             BEGIN SELECT RAISE(ABORT, 'notice update failed'); END;",
        )
        .unwrap();
        assert!(set_module_enabled(
            &conn,
            &state,
            SetModuleEnabledPayload {
                module: Module::PosturalAnalysis,
                enabled: false
            }
        )
        .is_err());
        assert!(is_module_enabled(&conn, &user_id, Module::PosturalAnalysis).unwrap());
        conn.execute_batch("DROP TRIGGER block_notice_updates;")
            .unwrap();
        assert!(statuses(&conn, &state)
            .iter()
            .all(|(_, status)| status == "ativo"));
    }

    #[test]
    fn settings_are_isolated_between_accounts_and_survive_reopening() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.db");
        let conn = Connection::open(&path).unwrap();
        initialize_database(&conn);
        let state = AuthState::new().unwrap();
        let first = authenticate(&conn, &state, "first@example.com");
        activate_all_notices(&conn, &state, &first);
        set(&conn, &state, Module::PosturalAnalysis, false);
        let second = authenticate(&conn, &state, "second@example.com");
        activate_all_notices(&conn, &state, &second);
        assert!(get_settings(&conn, &state)
            .unwrap()
            .is_module_enabled(Module::PosturalAnalysis));
        assert!(statuses(&conn, &state)
            .iter()
            .all(|(_, status)| status == "ativo"));
        drop(conn);

        let conn = Connection::open(&path).unwrap();
        let state = AuthState::new().unwrap();
        authenticate(&conn, &state, "first@example.com");
        assert!(!get_settings(&conn, &state)
            .unwrap()
            .is_module_enabled(Module::PosturalAnalysis));
        assert!(is_module_enabled(&conn, &second, Module::PosturalAnalysis).unwrap());
    }

    #[test]
    fn anonymous_and_guest_sessions_cannot_read_or_change_settings() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = authenticate(&conn, &state, "owner@example.com");
        for session in [Session::Anonymous, Session::Guest] {
            auth_service::set_session(&state, session).unwrap();
            assert_eq!(
                get_settings(&conn, &state).unwrap_err(),
                AUTHENTICATION_REQUIRED
            );
            assert!(update_settings(&conn, &state, UpdateSettingsPayload::default()).is_err());
            assert!(set_module_enabled(
                &conn,
                &state,
                SetModuleEnabledPayload {
                    module: Module::TypingAnalysis,
                    enabled: false
                }
            )
            .is_err());
            assert!(delete_settings(&conn, &state).is_err());
        }
        assert!(settings_repository::find_by_user_id(&conn, &user_id)
            .unwrap()
            .is_none());
    }

    fn update_json(
        conn: &Connection,
        state: &AuthState,
        payload: serde_json::Value,
    ) -> Result<Settings, String> {
        update_settings(conn, state, serde_json::from_value(payload).unwrap())
    }

    #[test]
    fn the_default_webcam_is_saved_kept_and_cleared_per_account() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        authenticate(&conn, &state, "first@example.com");
        assert_eq!(get_settings(&conn, &state).unwrap().web_cam, None);

        let saved =
            update_json(&conn, &state, serde_json::json!({ "webCam": "camera-2" })).unwrap();
        assert_eq!(saved.web_cam.as_deref(), Some("camera-2"));
        assert!(Module::ALL
            .iter()
            .all(|&module| saved.is_module_enabled(module)));
        assert_eq!(serde_json::to_value(&saved).unwrap()["webCam"], "camera-2");

        let module_off = set(&conn, &state, Module::OcularAnalysis, false);
        assert_eq!(module_off.web_cam.as_deref(), Some("camera-2"));
        let untouched = update_json(&conn, &state, serde_json::json!({})).unwrap();
        assert_eq!(untouched.web_cam.as_deref(), Some("camera-2"));
        assert!(!untouched.is_module_enabled(Module::OcularAnalysis));

        authenticate(&conn, &state, "second@example.com");
        assert_eq!(get_settings(&conn, &state).unwrap().web_cam, None);
        authenticate(&conn, &state, "first@example.com");
        assert_eq!(
            get_settings(&conn, &state).unwrap().web_cam.as_deref(),
            Some("camera-2")
        );

        let cleared = update_json(&conn, &state, serde_json::json!({ "webCam": null })).unwrap();
        assert_eq!(cleared.web_cam, None);
        update_json(&conn, &state, serde_json::json!({ "webCam": "camera-1" })).unwrap();
        assert!(delete_settings(&conn, &state).unwrap());
        assert_eq!(get_settings(&conn, &state).unwrap().web_cam, None);
    }

    #[test]
    fn invalid_webcam_identifiers_change_nothing() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        authenticate(&conn, &state, "owner@example.com");
        update_json(&conn, &state, serde_json::json!({ "webCam": "camera-1" })).unwrap();
        let before = get_settings(&conn, &state).unwrap();
        for invalid in [
            String::new(),
            "   ".to_string(),
            "x".repeat(WEB_CAM_MAX_LENGTH + 1),
        ] {
            assert_eq!(
                update_json(
                    &conn,
                    &state,
                    serde_json::json!({ "webCam": invalid, "typingAnalysis": false })
                )
                .unwrap_err(),
                "Invalid webcam identifier"
            );
            assert_eq!(get_settings(&conn, &state).unwrap(), before);
        }
        assert!(serde_json::from_value::<UpdateSettingsPayload>(
            serde_json::json!({ "webCam": 1 })
        )
        .is_err());
        let longest = "x".repeat(WEB_CAM_MAX_LENGTH);
        assert_eq!(
            update_json(&conn, &state, serde_json::json!({ "webCam": longest }))
                .unwrap()
                .web_cam,
            Some(longest)
        );
    }

    #[test]
    fn payloads_and_stored_values_are_validated() {
        let conn = setup_database();
        let state = AuthState::new().unwrap();
        let user_id = authenticate(&conn, &state, "owner@example.com");
        for invalid in [
            serde_json::json!({ "posturalAnalysis": false, "userId": "00000000-0000-4000-8000-000000000002" }),
            serde_json::json!({ "postural_analysis": false }),
            serde_json::json!({ "posturalAnalysis": 0 }),
        ] {
            assert!(serde_json::from_value::<UpdateSettingsPayload>(invalid).is_err());
        }
        for invalid in [
            serde_json::json!({ "module": "postural", "enabled": false }),
            serde_json::json!({ "module": "POSTURAL_ANALYSIS", "enabled": false }),
            serde_json::json!({ "module": "typing_analysis" }),
        ] {
            assert!(serde_json::from_value::<SetModuleEnabledPayload>(invalid).is_err());
        }
        get_settings(&conn, &state).unwrap();
        assert!(conn
            .execute(
                "UPDATE settings SET ocular_analysis = 2 WHERE user_id = ?1",
                [&user_id]
            )
            .is_err());
        assert!(conn
            .execute(
                "INSERT INTO settings (id, user_id) VALUES ('duplicate', ?1)",
                [&user_id]
            )
            .is_err());
        assert_eq!(
            settings_repository::insert(&conn, "duplicate", &user_id).unwrap(),
            0
        );
    }
}
