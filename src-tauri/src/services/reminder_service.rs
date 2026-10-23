use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::reminder::{
    CreateReminderPayload, Reminder, ReminderFrequency, SystemReminderType, UpdateReminderPayload,
};
use crate::repositories::reminder_repository;
use crate::services::auth_service::{require_authenticated_user_id, AuthState};

/// Stable IDs keep one configuration per catalog entry and account without
/// modifying the existing database schema or its migration checksum.
pub fn ensure_system_reminders(conn: &Connection, user_id: i64) -> Result<(), String> {
    let transaction = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    for kind in SystemReminderType::ALL {
        let id = kind.reminder_id(user_id);
        if reminder_repository::find_by_id(&transaction, user_id, &id)
            .map_err(|error| error.to_string())?
            .is_some()
        {
            continue;
        }
        let (title, message, category, interval) = match kind {
            SystemReminderType::PostureCheck => (
                "Revise sua postura",
                "Observe sua postura e ajuste os apoios para uma posição confortável.",
                "Postura",
                30,
            ),
            SystemReminderType::VisualBreak => (
                "Faça uma pausa visual",
                "Faça uma breve pausa da tela e direcione o olhar para um ponto distante.",
                "Pausa Visual",
                20,
            ),
            SystemReminderType::MovementBreak => (
                "Mude de posição",
                "Faça uma pausa para se movimentar e variar a posição, conforme seu conforto.",
                "Exercício",
                60,
            ),
        };
        let now = Utc::now().to_rfc3339();
        let reminder = Reminder {
            id,
            user_id: Some(user_id),
            system_type: Some(kind),
            title: title.into(),
            message: message.into(),
            description: Some(message.into()),
            category: category.into(),
            interval,
            period: "08:00 - 18:00".into(),
            frequency: ReminderFrequency::BusinessDays,
            notification_tone: true,
            status: "inativo".into(),
            start_time: Some("08:00".into()),
            end_time: Some("18:00".into()),
            reminder_date: None,
            custom_days: None,
            last_sent_at: None,
            created_at: Some(now.clone()),
            updated_at: Some(now),
        };
        validate_schedule(&reminder)?;
        reminder_repository::insert(&transaction, &reminder).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

pub fn parse_time_to_minutes(time_str: &str) -> Option<i32> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hours: i32 = parts[0].trim().parse().ok()?;
    let minutes: i32 = parts[1].trim().parse().ok()?;
    if (0..24).contains(&hours) && (0..60).contains(&minutes) {
        Some(hours * 60 + minutes)
    } else {
        None
    }
}

pub fn validate_reminder_times(
    start_time: Option<&str>,
    end_time: Option<&str>,
    interval: i32,
) -> Result<(), String> {
    if interval <= 0 {
        return Err("Interval must be at least 1 minute".to_string());
    }

    if let (Some(start), Some(end)) = (start_time, end_time) {
        let start_min = parse_time_to_minutes(start)
            .ok_or_else(|| format!("Invalid start time format: '{}'", start))?;
        let end_min = parse_time_to_minutes(end)
            .ok_or_else(|| format!("Invalid end time format: '{}'", end))?;

        if end_min <= start_min {
            return Err("End time must be after start time".to_string());
        }

        let duration_minutes = end_min - start_min;
        if interval >= duration_minutes {
            return Err(format!(
                "Interval ({} minutes) must be less than period duration ({} minutes)",
                interval, duration_minutes
            ));
        }
    }
    Ok(())
}

pub fn get_reminders(conn: &Connection, auth_state: &AuthState) -> Result<Vec<Reminder>, String> {
    let user_id = require_authenticated_user_id(auth_state)?;
    let mut reminders = reminder_repository::find_all(conn, user_id).map_err(|e| e.to_string())?;
    reminders.sort_by_key(|reminder| match reminder.system_type {
        Some(SystemReminderType::PostureCheck) => 0,
        Some(SystemReminderType::VisualBreak) => 1,
        Some(SystemReminderType::MovementBreak) => 2,
        None => 3,
    });
    Ok(reminders)
}

fn validate_schedule(reminder: &Reminder) -> Result<(), String> {
    let start = reminder
        .start_time
        .as_deref()
        .ok_or("Start time is required")?;
    parse_time_to_minutes(start).ok_or("Invalid start time")?;
    if reminder.interval <= 0 {
        return Err("Interval must be at least 1 minute".into());
    }
    if reminder.frequency == ReminderFrequency::Once {
        let date = reminder
            .reminder_date
            .as_deref()
            .ok_or("Reminder date is required")?;
        chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "Invalid reminder date")?;
    } else {
        let end = reminder.end_time.as_deref().ok_or("End time is required")?;
        validate_reminder_times(Some(start), Some(end), reminder.interval)?;
    }
    if reminder.frequency == ReminderFrequency::Custom {
        let days = reminder
            .custom_days
            .as_ref()
            .ok_or("Custom days are required")?;
        if days.is_empty()
            || days.iter().any(|day| {
                !matches!(
                    day.as_str(),
                    "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"
                )
            })
        {
            return Err("Invalid custom days".into());
        }
    }
    Ok(())
}

pub fn get_reminder_by_id(
    conn: &Connection,
    auth_state: &AuthState,
    id: &str,
) -> Result<Reminder, String> {
    let user_id = require_authenticated_user_id(auth_state)?;
    reminder_repository::find_by_id(conn, user_id, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", id))
}

pub fn create_reminder(
    conn: &Connection,
    auth_state: &AuthState,
    payload: CreateReminderPayload,
) -> Result<Reminder, String> {
    let user_id = require_authenticated_user_id(auth_state)?;

    if payload.frequency == ReminderFrequency::Once {
        match &payload.reminder_date {
            Some(date) if !date.trim().is_empty() => (),
            _ => return Err("Reminder date is required for once frequency".to_string()),
        }
    }

    if payload.frequency == ReminderFrequency::Custom {
        match &payload.custom_days {
            Some(days) if !days.is_empty() => (),
            _ => return Err("At least one day must be selected for custom frequency".to_string()),
        }
    }

    let reminder_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let notification_tone = payload.notification_tone.unwrap_or(true);
    let status = payload.status.unwrap_or_else(|| "ativo".to_string());
    if !matches!(status.as_str(), "ativo" | "inativo") {
        return Err("Invalid reminder status".into());
    }
    if payload.title.trim().is_empty() || payload.message.trim().is_empty() {
        return Err("Reminder title and message are required".into());
    }
    let description = payload
        .description
        .or_else(|| Some(payload.message.clone()));

    let reminder_date: Option<String> = if payload.frequency == ReminderFrequency::Once {
        payload.reminder_date
    } else {
        None
    };

    let custom_days: Option<Vec<String>> = if payload.frequency == ReminderFrequency::Custom {
        payload.custom_days
    } else {
        None
    };

    let reminder = Reminder {
        id: reminder_id,
        user_id: Some(user_id),
        system_type: None,
        title: payload.title,
        message: payload.message,
        description,
        category: payload.category,
        interval: payload.interval,
        period: payload.period,
        frequency: payload.frequency,
        notification_tone,
        status,
        start_time: payload.start_time,
        end_time: payload.end_time,
        reminder_date,
        custom_days,
        last_sent_at: None,
        created_at: Some(now.clone()),
        updated_at: Some(now),
    };

    validate_schedule(&reminder)?;
    reminder_repository::insert(conn, &reminder).map_err(|e| e.to_string())?;

    Ok(reminder)
}

pub fn update_reminder(
    conn: &Connection,
    auth_state: &AuthState,
    payload: UpdateReminderPayload,
) -> Result<Reminder, String> {
    let user_id = require_authenticated_user_id(auth_state)?;
    let existing_reminder = reminder_repository::find_by_id(conn, user_id, &payload.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", payload.id))?;

    if existing_reminder.system_type.is_some()
        && (payload.title.is_some()
            || payload.message.is_some()
            || payload.description.is_some()
            || payload.category.is_some())
    {
        return Err("System reminder content is fixed; only scheduling and notification settings can be changed".into());
    }
    if payload
        .status
        .as_deref()
        .is_some_and(|status| !matches!(status, "ativo" | "inativo"))
    {
        return Err("Invalid reminder status".into());
    }

    let updated_title = payload.title.unwrap_or(existing_reminder.title);
    let updated_message = payload.message.unwrap_or(existing_reminder.message);
    let updated_description = payload.description.or(existing_reminder.description);
    let updated_category = payload.category.unwrap_or(existing_reminder.category);
    let updated_interval = payload.interval.unwrap_or(existing_reminder.interval);
    let updated_frequency = payload.frequency.unwrap_or(existing_reminder.frequency);
    let updated_notification_tone = payload
        .notification_tone
        .unwrap_or(existing_reminder.notification_tone);
    let updated_status = payload.status.unwrap_or(existing_reminder.status);
    let updated_start_time = payload.start_time.or(existing_reminder.start_time);
    let updated_end_time = payload.end_time.or(existing_reminder.end_time);

    let updated_reminder_date: Option<String> = if updated_frequency == ReminderFrequency::Once {
        payload.reminder_date.or(existing_reminder.reminder_date)
    } else {
        None
    };
    let updated_custom_days: Option<Vec<String>> = if updated_frequency == ReminderFrequency::Custom
    {
        payload.custom_days.or(existing_reminder.custom_days)
    } else {
        None
    };

    if updated_frequency == ReminderFrequency::Once {
        match &updated_reminder_date {
            Some(date) if !date.trim().is_empty() => (),
            _ => return Err("Reminder date is required for once frequency".to_string()),
        }
    }

    if updated_frequency == ReminderFrequency::Custom {
        match &updated_custom_days {
            Some(days) if !days.is_empty() => (),
            _ => return Err("At least one day must be selected for custom frequency".to_string()),
        }
    }

    let updated_period = payload.period.unwrap_or_else(|| {
        if let (Some(s), Some(e)) = (updated_start_time.as_deref(), updated_end_time.as_deref()) {
            format!("{} - {}", s, e)
        } else {
            existing_reminder.period
        }
    });

    let now = Utc::now().to_rfc3339();

    let updated_reminder = Reminder {
        system_type: existing_reminder.system_type,
        id: payload.id,
        user_id: Some(user_id),
        title: updated_title,
        message: updated_message,
        description: updated_description,
        category: updated_category,
        interval: updated_interval,
        period: updated_period,
        frequency: updated_frequency,
        notification_tone: updated_notification_tone,
        status: updated_status,
        start_time: updated_start_time,
        end_time: updated_end_time,
        reminder_date: updated_reminder_date,
        custom_days: updated_custom_days,
        last_sent_at: existing_reminder.last_sent_at,
        created_at: existing_reminder.created_at,
        updated_at: Some(now),
    };

    validate_schedule(&updated_reminder)?;
    reminder_repository::update(conn, &updated_reminder).map_err(|e| e.to_string())?;

    Ok(updated_reminder)
}

pub fn delete_reminder(
    conn: &Connection,
    auth_state: &AuthState,
    id: &str,
) -> Result<bool, String> {
    let user_id = require_authenticated_user_id(auth_state)?;
    if reminder_repository::find_by_id(conn, user_id, id)
        .map_err(|error| error.to_string())?
        .is_some_and(|reminder| reminder.system_type.is_some())
    {
        return Err("System reminders cannot be deleted; disable the reminder instead".into());
    }
    let rows_affected =
        reminder_repository::delete(conn, user_id, id).map_err(|e| e.to_string())?;
    Ok(rows_affected > 0)
}

pub fn toggle_reminder_status(
    conn: &Connection,
    auth_state: &AuthState,
    id: &str,
) -> Result<Reminder, String> {
    let user_id = require_authenticated_user_id(auth_state)?;
    let mut reminder = reminder_repository::find_by_id(conn, user_id, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", id))?;

    let new_status = if reminder.status == "ativo" {
        "inativo"
    } else {
        "ativo"
    };

    let now = Utc::now().to_rfc3339();
    reminder_repository::update_status(conn, user_id, id, new_status, &now)
        .map_err(|e| e.to_string())?;

    reminder.status = new_status.to_string();
    reminder.updated_at = Some(now);

    Ok(reminder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::auth::Session;
    use crate::repositories::user_repository;
    use crate::services::auth_service;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn
    }

    fn authenticate_test_user(conn: &Connection, state: &AuthState, email: &str) -> i64 {
        conn.execute(
            "INSERT INTO users (first_name, last_name, birth_date, password_hash, email, phone)
             VALUES ('Test', 'User', '1995-05-20', 'test-hash', ?1, '75999999999')",
            [email],
        )
        .unwrap();
        let user_id = conn.last_insert_rowid();
        let user = user_repository::find_by_id(conn, user_id)
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
        user_id
    }

    fn create_payload() -> CreateReminderPayload {
        serde_json::from_value(serde_json::json!({
            "title": "Drink water", "message": "Drink 250ml", "category": "Hidratação",
            "interval": 60, "period": "08:00 - 18:00", "frequency": "DAILY",
            "startTime": "08:00", "endTime": "18:00"
        }))
        .unwrap()
    }

    fn update_payload(id: &str) -> UpdateReminderPayload {
        serde_json::from_value(serde_json::json!({ "id": id, "title": "Updated reminder" }))
            .unwrap()
    }

    #[test]
    fn custom_reminders_coexist_with_the_catalog_and_allow_status_changes() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &state, "owner@example.com");
        ensure_system_reminders(&conn, user_id).unwrap();
        let catalog = get_reminders(&conn, &state).unwrap();
        let mut payload = create_payload();
        payload.status = Some("inativo".into());
        let created = create_reminder(&conn, &state, payload).unwrap();
        assert_eq!(created.system_type, None);
        assert_eq!(created.user_id, Some(user_id));
        assert_eq!(created.status, "inativo");
        assert!(Uuid::parse_str(&created.id).is_ok());
        assert_eq!(get_reminders(&conn, &state).unwrap().len(), 4);

        let settings = serde_json::from_value(serde_json::json!({
            "id": created.id, "title": "My personal reminder", "status": "ativo"
        }))
        .unwrap();
        let updated = update_reminder(&conn, &state, settings).unwrap();
        assert_eq!(updated.title, "My personal reminder");
        assert_eq!(updated.status, "ativo");
        assert_eq!(
            get_reminder_by_id(&conn, &state, &created.id).unwrap(),
            updated
        );
        assert_eq!(
            toggle_reminder_status(&conn, &state, &created.id)
                .unwrap()
                .status,
            "inativo"
        );
        assert!(delete_reminder(&conn, &state, &created.id).unwrap());
        assert_eq!(get_reminders(&conn, &state).unwrap(), catalog);
    }

    #[test]
    fn custom_reminder_creation_validates_status_and_required_content() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        authenticate_test_user(&conn, &state, "owner@example.com");
        for status in ["", "unknown", "ATIVO"] {
            let mut payload = create_payload();
            payload.status = Some(status.into());
            assert_eq!(
                create_reminder(&conn, &state, payload).unwrap_err(),
                "Invalid reminder status"
            );
        }
        for (title, message) in [(" ", "Message"), ("Title", "\t")] {
            let mut payload = create_payload();
            payload.title = title.into();
            payload.message = message.into();
            assert!(create_reminder(&conn, &state, payload).is_err());
        }
        assert!(get_reminders(&conn, &state).unwrap().is_empty());
        let created = create_reminder(&conn, &state, create_payload()).unwrap();
        assert_eq!(created.status, "ativo");
    }

    #[test]
    fn custom_creation_cannot_impersonate_a_system_reminder() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &state, "owner@example.com");
        ensure_system_reminders(&conn, user_id).unwrap();
        let system_id = SystemReminderType::PostureCheck.reminder_id(user_id);
        let original = get_reminder_by_id(&conn, &state, &system_id).unwrap();
        let payload = serde_json::from_value(serde_json::json!({
            "id": system_id, "systemType": "POSTURE_CHECK",
            "title": "Custom title", "message": "Custom message", "category": "Postura",
            "interval": 15, "period": "08:00 - 18:00", "frequency": "DAILY",
            "startTime": "08:00", "endTime": "18:00", "status": "ativo"
        }))
        .unwrap();
        let custom = create_reminder(&conn, &state, payload).unwrap();
        assert_ne!(custom.id, system_id);
        assert_eq!(custom.system_type, None);
        assert_eq!(
            get_reminder_by_id(&conn, &state, &system_id).unwrap(),
            original
        );
    }

    #[test]
    fn system_catalog_is_created_once_and_starts_disabled() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &state, "owner@example.com");
        ensure_system_reminders(&conn, user_id).unwrap();
        let first = get_reminders(&conn, &state).unwrap();
        ensure_system_reminders(&conn, user_id).unwrap();
        assert_eq!(get_reminders(&conn, &state).unwrap(), first);
        assert_eq!(first.len(), 3);
        for (reminder, kind) in first.iter().zip(SystemReminderType::ALL) {
            assert_eq!(reminder.system_type, Some(kind));
            assert_eq!(reminder.id, kind.reminder_id(user_id));
            assert_eq!(reminder.user_id, Some(user_id));
            assert_eq!(reminder.status, "inativo");
            assert_eq!(reminder.frequency, ReminderFrequency::BusinessDays);
            assert_eq!(
                serde_json::to_value(reminder).unwrap()["systemType"],
                kind.as_str()
            );
            validate_schedule(reminder).unwrap();
        }
    }

    #[test]
    fn system_reminders_preserve_preferences_and_last_send_time() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &state, "owner@example.com");
        ensure_system_reminders(&conn, user_id).unwrap();
        let original = get_reminders(&conn, &state).unwrap().remove(0);
        let payload = serde_json::from_value(serde_json::json!({
            "id": original.id, "interval": 15, "period": "09:00 - 17:00",
            "startTime": "09:00", "endTime": "17:00", "frequency": "CUSTOM",
            "customDays": ["MON", "WED"], "notificationTone": false, "status": "ativo"
        }))
        .unwrap();
        let updated = update_reminder(&conn, &state, payload).unwrap();
        assert_eq!(updated.system_type, original.system_type);
        assert_eq!(updated.title, original.title);
        assert_eq!(updated.message, original.message);
        assert_eq!(updated.category, original.category);
        assert_eq!(updated.interval, 15);
        assert_eq!(updated.status, "ativo");
        assert!(!updated.notification_tone);
        let sent_at = "2026-10-19T12:00:00Z";
        reminder_repository::update_last_sent_at(&conn, user_id, &updated.id, sent_at).unwrap();
        let stored = get_reminder_by_id(&conn, &state, &updated.id).unwrap();
        ensure_system_reminders(&conn, user_id).unwrap();
        assert_eq!(
            get_reminder_by_id(&conn, &state, &updated.id).unwrap(),
            stored
        );
        assert_eq!(stored.last_sent_at.as_deref(), Some(sent_at));
    }

    #[test]
    fn system_content_and_catalog_entries_cannot_be_changed_or_deleted() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &state, "owner@example.com");
        ensure_system_reminders(&conn, user_id).unwrap();
        let original = get_reminders(&conn, &state).unwrap().remove(0);
        for field in ["title", "message", "description", "category"] {
            let mut payload = serde_json::json!({ "id": original.id });
            payload[field] = serde_json::json!("Changed content");
            assert!(
                update_reminder(&conn, &state, serde_json::from_value(payload).unwrap()).is_err()
            );
            assert_eq!(
                get_reminder_by_id(&conn, &state, &original.id).unwrap(),
                original
            );
        }
        assert!(delete_reminder(&conn, &state, &original.id).is_err());
        assert_eq!(get_reminders(&conn, &state).unwrap().len(), 3);
        assert_eq!(
            toggle_reminder_status(&conn, &state, &original.id)
                .unwrap()
                .status,
            "ativo"
        );
        assert_eq!(
            toggle_reminder_status(&conn, &state, &original.id)
                .unwrap()
                .status,
            "inativo"
        );
    }

    #[test]
    fn ergonomic_settings_are_isolated_between_users_and_legacy_records_are_preserved() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let first_user = authenticate_test_user(&conn, &state, "first@example.com");
        let legacy = create_reminder(&conn, &state, create_payload()).unwrap();
        ensure_system_reminders(&conn, first_user).unwrap();
        assert_eq!(get_reminders(&conn, &state).unwrap().len(), 4);
        assert_eq!(
            get_reminder_by_id(&conn, &state, &legacy.id).unwrap(),
            legacy
        );
        let first_id = SystemReminderType::PostureCheck.reminder_id(first_user);
        let second_user = authenticate_test_user(&conn, &state, "second@example.com");
        ensure_system_reminders(&conn, second_user).unwrap();
        assert!(get_reminder_by_id(&conn, &state, &first_id).is_err());
        assert!(toggle_reminder_status(&conn, &state, &first_id).is_err());
        assert!(!delete_reminder(&conn, &state, &first_id).unwrap());
        assert!(get_reminders(&conn, &state)
            .unwrap()
            .iter()
            .all(|reminder| reminder.user_id == Some(second_user) && reminder.status == "inativo"));
    }

    #[test]
    fn catalog_types_are_derived_only_from_matching_server_owned_ids() {
        assert_eq!(
            SystemReminderType::from_reminder_id("system-reminder:7:POSTURE_CHECK", Some(7)),
            Some(SystemReminderType::PostureCheck)
        );
        assert_eq!(
            SystemReminderType::from_reminder_id("system-reminder:7:POSTURE_CHECK", Some(8)),
            None
        );
        assert_eq!(
            SystemReminderType::from_reminder_id("system-reminder:7:POSTURE_CHECK", None),
            None
        );
        assert_eq!(
            SystemReminderType::from_reminder_id("system-reminder:7:UNKNOWN", Some(7)),
            None
        );
        assert_eq!(
            SystemReminderType::from_reminder_id("legacy-id", Some(7)),
            None
        );
    }

    #[test]
    fn system_preferences_survive_reopening_the_existing_schema() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("ergonomic-reminders.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        let state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &state, "owner@example.com");
        ensure_system_reminders(&conn, user_id).unwrap();
        let id = SystemReminderType::VisualBreak.reminder_id(user_id);
        let payload = serde_json::from_value(
            serde_json::json!({ "id": id, "interval": 10, "status": "ativo" }),
        )
        .unwrap();
        let configured = update_reminder(&conn, &state, payload).unwrap();
        drop(conn);
        let conn = Connection::open(&path).unwrap();
        ensure_system_reminders(&conn, user_id).unwrap();
        assert_eq!(get_reminder_by_id(&conn, &state, &id).unwrap(), configured);
        assert_eq!(get_reminders(&conn, &state).unwrap().len(), 3);
    }

    #[test]
    fn invalid_schedule_or_status_does_not_change_a_system_reminder() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &state, "owner@example.com");
        ensure_system_reminders(&conn, user_id).unwrap();
        let original = get_reminders(&conn, &state).unwrap().remove(0);
        for changes in [
            serde_json::json!({"interval": 0}),
            serde_json::json!({"status": "unknown"}),
        ] {
            let mut payload = changes;
            payload["id"] = serde_json::json!(original.id);
            assert!(
                update_reminder(&conn, &state, serde_json::from_value(payload).unwrap()).is_err()
            );
            assert_eq!(
                get_reminder_by_id(&conn, &state, &original.id).unwrap(),
                original
            );
        }
    }

    #[test]
    fn test_reminder_crud_lifecycle() {
        let conn = setup_test_db();
        let auth_state = AuthState::new().unwrap();
        let user_id = authenticate_test_user(&conn, &auth_state, "owner@example.com");

        // 1. Create reminder via service
        let create_payload = CreateReminderPayload {
            title: "Drink Water".to_string(),
            message: "Drink 250ml".to_string(),
            description: Some("Drink 250ml".to_string()),
            category: "Hidratação".to_string(),
            interval: 60,
            period: "08:00 - 18:00".to_string(),
            frequency: ReminderFrequency::Custom,
            notification_tone: Some(true),
            status: Some("ativo".to_string()),
            start_time: Some("08:00".to_string()),
            end_time: Some("18:00".to_string()),
            reminder_date: None,
            custom_days: Some(vec![
                "MON".to_string(),
                "WED".to_string(),
                "FRI".to_string(),
            ]),
        };

        let created = create_reminder(&conn, &auth_state, create_payload).unwrap();
        assert_eq!(created.user_id, Some(user_id));
        let reminder_id = created.id;

        // 2. Read via service
        let fetched = get_reminder_by_id(&conn, &auth_state, &reminder_id).unwrap();
        assert_eq!(fetched.id, reminder_id);
        assert_eq!(fetched.title, "Drink Water");
        assert_eq!(fetched.interval, 60);
        assert_eq!(fetched.frequency, ReminderFrequency::Custom);
        assert_eq!(
            fetched.custom_days,
            Some(vec![
                "MON".to_string(),
                "WED".to_string(),
                "FRI".to_string()
            ])
        );
        assert!(fetched.notification_tone);
        assert_eq!(fetched.status, "ativo");

        // 3. Update to ONCE (clearing custom_days)
        let update_payload = UpdateReminderPayload {
            id: reminder_id.clone(),
            title: Some("Drink More Water".to_string()),
            message: None,
            description: None,
            category: None,
            interval: None,
            period: None,
            frequency: Some(ReminderFrequency::Once),
            notification_tone: None,
            status: Some("inativo".to_string()),
            start_time: None,
            end_time: None,
            reminder_date: Some("2026-09-16".to_string()),
            custom_days: None,
        };

        let updated = update_reminder(&conn, &auth_state, update_payload).unwrap();
        assert_eq!(updated.user_id, Some(user_id));
        assert_eq!(updated.title, "Drink More Water");
        assert_eq!(updated.status, "inativo");
        assert_eq!(updated.frequency, ReminderFrequency::Once);
        assert_eq!(updated.custom_days, None);
        assert_eq!(updated.reminder_date, Some("2026-09-16".to_string()));

        // 4. Toggle status
        let toggled = toggle_reminder_status(&conn, &auth_state, &reminder_id).unwrap();
        assert_eq!(toggled.status, "ativo");

        // 5. Delete
        let deleted = delete_reminder(&conn, &auth_state, &reminder_id).unwrap();
        assert!(deleted);

        // 6. Verify not found
        let err = get_reminder_by_id(&conn, &auth_state, &reminder_id);
        assert!(err.is_err());
    }

    #[test]
    fn reminders_are_isolated_between_users_and_unassigned_records() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let first_user_id = authenticate_test_user(&conn, &state, "first@example.com");
        let first = create_reminder(&conn, &state, create_payload()).unwrap();
        conn.execute(
            "INSERT INTO reminders (id, title, message, category, interval, period, frequency)
             VALUES ('unassigned', 'Example', 'Example message', 'Postura', 30, '08:00 - 18:00', 'DAILY')",
            [],
        ).unwrap();

        let second_user_id = authenticate_test_user(&conn, &state, "second@example.com");
        assert!(get_reminders(&conn, &state).unwrap().is_empty());
        let second = create_reminder(&conn, &state, create_payload()).unwrap();
        assert_eq!(second.user_id, Some(second_user_id));
        assert_eq!(get_reminders(&conn, &state).unwrap()[0].id, second.id);

        for id in [&first.id, "unassigned"] {
            assert!(get_reminder_by_id(&conn, &state, id).is_err());
            assert!(update_reminder(&conn, &state, update_payload(id)).is_err());
            assert!(toggle_reminder_status(&conn, &state, id).is_err());
            assert!(!delete_reminder(&conn, &state, id).unwrap());
        }
        // Unknown and unauthorized IDs return the same result.
        assert_eq!(
            get_reminder_by_id(&conn, &state, &first.id).unwrap_err(),
            format!("Reminder with id '{}' not found", first.id)
        );
        assert!(get_reminder_by_id(&conn, &state, "missing").is_err());

        let first_user = user_repository::find_by_id(&conn, first_user_id)
            .unwrap()
            .unwrap()
            .user;
        auth_service::set_session(
            &state,
            Session::Authenticated {
                user: Box::new(first_user),
            },
        )
        .unwrap();
        let visible = get_reminders(&conn, &state).unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, first.id);
        assert_eq!(
            serde_json::to_value(&visible[0]).unwrap(),
            serde_json::to_value(&first).unwrap()
        );
        assert!(get_reminder_by_id(&conn, &state, &second.id).is_err());
        assert!(update_reminder(&conn, &state, update_payload(&second.id)).is_err());
        assert!(toggle_reminder_status(&conn, &state, &second.id).is_err());
        assert!(!delete_reminder(&conn, &state, &second.id).unwrap());
    }

    #[test]
    fn anonymous_guest_and_logged_out_sessions_cannot_manage_reminders() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        authenticate_test_user(&conn, &state, "owner@example.com");
        let reminder = create_reminder(&conn, &state, create_payload()).unwrap();

        for session in [Session::Anonymous, Session::Guest] {
            auth_service::set_session(&state, session).unwrap();
            let expected = "Authentication is required to manage reminders";
            assert_eq!(get_reminders(&conn, &state).unwrap_err(), expected);
            assert_eq!(
                get_reminder_by_id(&conn, &state, &reminder.id).unwrap_err(),
                expected
            );
            assert_eq!(
                create_reminder(&conn, &state, create_payload()).unwrap_err(),
                expected
            );
            assert_eq!(
                update_reminder(&conn, &state, update_payload(&reminder.id)).unwrap_err(),
                expected
            );
            assert_eq!(
                delete_reminder(&conn, &state, &reminder.id).unwrap_err(),
                expected
            );
            assert_eq!(
                toggle_reminder_status(&conn, &state, &reminder.id).unwrap_err(),
                expected
            );
        }

        let owner = user_repository::find_by_id(&conn, reminder.user_id.unwrap())
            .unwrap()
            .unwrap()
            .user;
        auth_service::set_session(
            &state,
            Session::Authenticated {
                user: Box::new(owner),
            },
        )
        .unwrap();
        assert_eq!(get_reminders(&conn, &state).unwrap().len(), 1);
        auth_service::logout(&state).unwrap();
        assert!(get_reminders(&conn, &state).is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reminders", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn payload_cannot_override_authenticated_owner_or_last_sent_at() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let other_user_id = authenticate_test_user(&conn, &state, "other@example.com");
        let owner_id = authenticate_test_user(&conn, &state, "owner@example.com");
        let payload: CreateReminderPayload = serde_json::from_value(serde_json::json!({
            "title": "Drink water", "message": "Drink 250ml", "category": "Hidratação",
            "interval": 60, "period": "08:00 - 18:00", "frequency": "DAILY",
            "startTime": "08:00", "endTime": "18:00", "userId": other_user_id,
            "lastSentAt": "2026-01-01T00:00:00Z"
        }))
        .unwrap();
        let created = create_reminder(&conn, &state, payload).unwrap();
        assert_eq!(created.user_id, Some(owner_id));
        assert!(created.last_sent_at.is_none());
        let sent_at = "2026-10-06T12:00:00Z";
        reminder_repository::update_last_sent_at(&conn, owner_id, &created.id, sent_at).unwrap();
        let payload: UpdateReminderPayload = serde_json::from_value(serde_json::json!({
            "id": created.id, "title": "Updated", "userId": other_user_id,
            "lastSentAt": "2026-01-01T00:00:00Z"
        }))
        .unwrap();
        let updated = update_reminder(&conn, &state, payload).unwrap();
        assert_eq!(updated.user_id, Some(owner_id));
        assert_eq!(updated.last_sent_at.as_deref(), Some(sent_at));
        let stored = get_reminder_by_id(&conn, &state, &updated.id).unwrap();
        assert_eq!(stored.last_sent_at, updated.last_sent_at);
        let toggled = toggle_reminder_status(&conn, &state, &updated.id).unwrap();
        assert_eq!(toggled.last_sent_at, updated.last_sent_at);
        assert_eq!(
            reminder_repository::find_by_id(&conn, owner_id, &updated.id)
                .unwrap()
                .unwrap()
                .user_id,
            Some(owner_id)
        );
        assert!(reminder_repository::find_all(&conn, other_user_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn notification_timestamp_updates_are_scoped_to_owner() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        let owner_id = authenticate_test_user(&conn, &state, "owner@example.com");
        let reminder = create_reminder(&conn, &state, create_payload()).unwrap();
        let other_id = authenticate_test_user(&conn, &state, "other@example.com");
        let sent_at = "2026-10-06T12:00:00Z";
        assert_eq!(
            reminder_repository::update_last_sent_at(&conn, other_id, &reminder.id, sent_at)
                .unwrap(),
            0
        );
        assert_eq!(
            reminder_repository::update_last_sent_at(&conn, owner_id, "missing", sent_at).unwrap(),
            0
        );
        let stored = reminder_repository::find_by_id(&conn, owner_id, &reminder.id)
            .unwrap()
            .unwrap();
        assert_eq!(stored, reminder);
    }

    #[test]
    fn ownership_and_send_time_persist_after_reopening_database() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("reminders.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let state = AuthState::new().unwrap();
        let owner_id = authenticate_test_user(&conn, &state, "owner@example.com");
        let reminder = create_reminder(&conn, &state, create_payload()).unwrap();
        let sent_at = "2026-10-06T12:00:00Z";
        reminder_repository::update_last_sent_at(&conn, owner_id, &reminder.id, sent_at).unwrap();
        drop(conn);

        let conn = Connection::open(&db_path).unwrap();
        let restored = get_reminder_by_id(&conn, &state, &reminder.id).unwrap();
        assert_eq!(restored.user_id, Some(owner_id));
        assert_eq!(restored.last_sent_at.as_deref(), Some(sent_at));
        assert_eq!(restored.updated_at, reminder.updated_at);
        assert_eq!(get_reminders(&conn, &state).unwrap().len(), 1);
    }

    #[test]
    fn test_validate_reminder_times() {
        assert!(validate_reminder_times(Some("08:00"), Some("18:00"), 30).is_ok());
        assert!(validate_reminder_times(Some("09:00"), Some("10:00"), 59).is_ok());

        let err_equal = validate_reminder_times(Some("09:00"), Some("10:00"), 60);
        assert!(err_equal.is_err());
        assert!(err_equal.unwrap_err().contains("must be less than"));

        let err_greater = validate_reminder_times(Some("09:00"), Some("10:00"), 120);
        assert!(err_greater.is_err());

        let err_order = validate_reminder_times(Some("18:00"), Some("08:00"), 30);
        assert!(err_order.is_err());
        assert_eq!(err_order.unwrap_err(), "End time must be after start time");

        let err_same = validate_reminder_times(Some("08:00"), Some("08:00"), 30);
        assert!(err_same.is_err());

        let err_zero = validate_reminder_times(Some("08:00"), Some("18:00"), 0);
        assert!(err_zero.is_err());
        assert_eq!(err_zero.unwrap_err(), "Interval must be at least 1 minute");
    }

    #[test]
    fn schedule_validation_rejects_invalid_dates_days_and_missing_times() {
        let conn = setup_test_db();
        let state = AuthState::new().unwrap();
        authenticate_test_user(&conn, &state, "owner@example.com");
        let mut payload = create_payload();
        payload.start_time = None;
        assert!(create_reminder(&conn, &state, payload).is_err());
        let mut payload = create_payload();
        payload.frequency = ReminderFrequency::Once;
        payload.reminder_date = Some("2026-02-30".into());
        assert!(create_reminder(&conn, &state, payload).is_err());
        let mut payload = create_payload();
        payload.frequency = ReminderFrequency::Custom;
        payload.custom_days = Some(vec!["INVALID".into()]);
        assert!(create_reminder(&conn, &state, payload).is_err());

        let mut payload = create_payload();
        payload.frequency = ReminderFrequency::Once;
        payload.reminder_date = Some("2026-10-06".into());
        payload.start_time = Some("23:59".into());
        payload.end_time = None;
        let reminder = create_reminder(&conn, &state, payload).unwrap();
        assert_eq!(reminder.start_time.as_deref(), Some("23:59"));
        let mut update = update_payload(&reminder.id);
        update.reminder_date = Some("invalid".into());
        assert!(update_reminder(&conn, &state, update).is_err());
    }
}
