use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::models::reminder::{
    CreateReminderPayload, Reminder, ReminderFrequency, UpdateReminderPayload,
};
use crate::repositories::reminder_repository;

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

pub fn get_reminders(conn: &Connection) -> Result<Vec<Reminder>, String> {
    reminder_repository::find_all(conn).map_err(|e| e.to_string())
}

pub fn get_reminder_by_id(conn: &Connection, id: &str) -> Result<Reminder, String> {
    reminder_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", id))
}

pub fn create_reminder(
    conn: &Connection,
    payload: CreateReminderPayload,
) -> Result<Reminder, String> {
    validate_reminder_times(
        payload.start_time.as_deref(),
        payload.end_time.as_deref(),
        payload.interval,
    )?;

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
    let description = payload.description.or_else(|| Some(payload.message.clone()));

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
        created_at: Some(now.clone()),
        updated_at: Some(now),
    };

    reminder_repository::insert(conn, &reminder).map_err(|e| e.to_string())?;

    Ok(reminder)
}

pub fn update_reminder(
    conn: &Connection,
    payload: UpdateReminderPayload,
) -> Result<Reminder, String> {
    let existing_reminder = reminder_repository::find_by_id(conn, &payload.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", payload.id))?;

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
    let updated_custom_days: Option<Vec<String>> = if updated_frequency == ReminderFrequency::Custom {
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

    validate_reminder_times(
        updated_start_time.as_deref(),
        updated_end_time.as_deref(),
        updated_interval,
    )?;

    let now = Utc::now().to_rfc3339();

    let updated_reminder = Reminder {
        id: payload.id,
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
        created_at: existing_reminder.created_at,
        updated_at: Some(now),
    };

    reminder_repository::update(conn, &updated_reminder).map_err(|e| e.to_string())?;

    Ok(updated_reminder)
}

pub fn delete_reminder(conn: &Connection, id: &str) -> Result<bool, String> {
    let rows_affected = reminder_repository::delete(conn, id).map_err(|e| e.to_string())?;
    Ok(rows_affected > 0)
}

pub fn toggle_reminder_status(conn: &Connection, id: &str) -> Result<Reminder, String> {
    let mut reminder = reminder_repository::find_by_id(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", id))?;

    let new_status = if reminder.status == "ativo" {
        "inativo"
    } else {
        "ativo"
    };

    let now = Utc::now().to_rfc3339();
    reminder_repository::update_status(conn, id, new_status, &now).map_err(|e| e.to_string())?;

    reminder.status = new_status.to_string();
    reminder.updated_at = Some(now);

    Ok(reminder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE reminders (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                interval INTEGER NOT NULL,
                period TEXT NOT NULL,
                frequency TEXT NOT NULL,
                notification_tone INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'ativo',
                start_time TEXT,
                end_time TEXT,
                reminder_date TEXT,
                custom_days TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_reminder_crud_lifecycle() {
        let conn = setup_test_db();

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
            custom_days: Some(vec!["MON".to_string(), "WED".to_string(), "FRI".to_string()]),
        };

        let created = create_reminder(&conn, create_payload).unwrap();
        let reminder_id = created.id;

        // 2. Read via service
        let fetched = get_reminder_by_id(&conn, &reminder_id).unwrap();
        assert_eq!(fetched.id, reminder_id);
        assert_eq!(fetched.title, "Drink Water");
        assert_eq!(fetched.interval, 60);
        assert_eq!(fetched.frequency, ReminderFrequency::Custom);
        assert_eq!(
            fetched.custom_days,
            Some(vec!["MON".to_string(), "WED".to_string(), "FRI".to_string()])
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

        let updated = update_reminder(&conn, update_payload).unwrap();
        assert_eq!(updated.title, "Drink More Water");
        assert_eq!(updated.status, "inativo");
        assert_eq!(updated.frequency, ReminderFrequency::Once);
        assert_eq!(updated.custom_days, None);
        assert_eq!(updated.reminder_date, Some("2026-09-16".to_string()));

        // 4. Toggle status
        let toggled = toggle_reminder_status(&conn, &reminder_id).unwrap();
        assert_eq!(toggled.status, "ativo");

        // 5. Delete
        let deleted = delete_reminder(&conn, &reminder_id).unwrap();
        assert!(deleted);

        // 6. Verify not found
        let err = get_reminder_by_id(&conn, &reminder_id);
        assert!(err.is_err());
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
}
