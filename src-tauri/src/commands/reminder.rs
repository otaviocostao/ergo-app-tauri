use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::models::reminder::{
    CreateReminderPayload, Reminder, ReminderFrequency, UpdateReminderPayload,
};

fn map_reminder_row(row: &rusqlite::Row<'_>) -> Result<Reminder, rusqlite::Error> {
    let notification_tone_int: i32 = row.get(8)?;
    let custom_days_raw: Option<String> = row.get(13)?;
    let custom_days: Option<Vec<String>> = match custom_days_raw {
        Some(ref raw) if !raw.trim().is_empty() => serde_json::from_str(raw).ok(),
        _ => None,
    };

    Ok(Reminder {
        id: row.get(0)?,
        title: row.get(1)?,
        message: row.get(2)?,
        description: row.get(3)?,
        category: row.get(4)?,
        interval: row.get(5)?,
        period: row.get(6)?,
        frequency: row.get(7)?,
        notification_tone: notification_tone_int != 0,
        status: row.get(9)?,
        start_time: row.get(10)?,
        end_time: row.get(11)?,
        reminder_date: row.get(12)?,
        custom_days,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

const SELECT_REMINDER_FIELDS: &str = "id, title, message, description, category, interval, period, frequency, notification_tone, status, start_time, end_time, reminder_date, custom_days, created_at, updated_at";

fn parse_time_to_minutes(time_str: &str) -> Option<i32> {
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

fn validate_reminder_times(
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

#[tauri::command]
pub fn get_reminders(state: State<'_, AppState>) -> Result<Vec<Reminder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let query = format!(
        "SELECT {} FROM reminders ORDER BY datetime(created_at) DESC, id DESC",
        SELECT_REMINDER_FIELDS
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let reminder_iter = stmt
        .query_map([], |row| map_reminder_row(row))
        .map_err(|e| e.to_string())?;

    let mut reminders = Vec::new();
    for reminder in reminder_iter {
        reminders.push(reminder.map_err(|e| e.to_string())?);
    }

    Ok(reminders)
}

#[tauri::command]
pub fn get_reminder_by_id(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let query = format!(
        "SELECT {} FROM reminders WHERE id = ?1",
        SELECT_REMINDER_FIELDS
    );

    let reminder = conn
        .query_row(&query, params![id], |row| map_reminder_row(row))
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", id))?;

    Ok(reminder)
}

#[tauri::command]
pub fn create_reminder(
    state: State<'_, AppState>,
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

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let reminder_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let notification_tone_int = if payload.notification_tone.unwrap_or(true) { 1 } else { 0 };
    let status = payload.status.unwrap_or_else(|| "ativo".to_string());
    let description = payload.description.or_else(|| Some(payload.message.clone()));

    let reminder_date: Option<String> = if payload.frequency == ReminderFrequency::Once {
        payload.reminder_date
    } else {
        None
    };

    let custom_days_json: Option<String> = if payload.frequency == ReminderFrequency::Custom {
        payload
            .custom_days
            .as_ref()
            .and_then(|days| serde_json::to_string(days).ok())
    } else {
        None
    };

    conn.execute(
        "INSERT INTO reminders (
            id, title, message, description, category, interval, period,
            frequency, notification_tone, status, start_time, end_time, reminder_date, custom_days, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            reminder_id,
            payload.title,
            payload.message,
            description,
            payload.category,
            payload.interval,
            payload.period,
            payload.frequency,
            notification_tone_int,
            status,
            payload.start_time,
            payload.end_time,
            reminder_date,
            custom_days_json,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let query = format!(
        "SELECT {} FROM reminders WHERE id = ?1",
        SELECT_REMINDER_FIELDS
    );

    let created_reminder = conn
        .query_row(&query, params![reminder_id], |row| map_reminder_row(row))
        .map_err(|e| e.to_string())?;

    Ok(created_reminder)
}

#[tauri::command]
pub fn update_reminder(
    state: State<'_, AppState>,
    payload: UpdateReminderPayload,
) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let query = format!(
        "SELECT {} FROM reminders WHERE id = ?1",
        SELECT_REMINDER_FIELDS
    );

    let existing_reminder: Reminder = conn
        .query_row(&query, params![payload.id], |row| map_reminder_row(row))
        .optional()
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
    let notification_tone_int = if updated_notification_tone { 1 } else { 0 };
    let custom_days_json: Option<String> = if updated_frequency == ReminderFrequency::Custom {
        updated_custom_days
            .as_ref()
            .and_then(|days| serde_json::to_string(days).ok())
    } else {
        None
    };

    conn.execute(
        "UPDATE reminders SET
            title = ?1,
            message = ?2,
            description = ?3,
            category = ?4,
            interval = ?5,
            period = ?6,
            frequency = ?7,
            notification_tone = ?8,
            status = ?9,
            start_time = ?10,
            end_time = ?11,
            reminder_date = ?12,
            custom_days = ?13,
            updated_at = ?14
        WHERE id = ?15",
        params![
            updated_title,
            updated_message,
            updated_description,
            updated_category,
            updated_interval,
            updated_period,
            updated_frequency,
            notification_tone_int,
            updated_status,
            updated_start_time,
            updated_end_time,
            updated_reminder_date,
            custom_days_json,
            now,
            payload.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let updated_reminder = conn
        .query_row(&query, params![payload.id], |row| map_reminder_row(row))
        .map_err(|e| e.to_string())?;

    Ok(updated_reminder)
}

#[tauri::command]
pub fn delete_reminder(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute("DELETE FROM reminders WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(rows_affected > 0)
}

#[tauri::command]
pub fn toggle_reminder_status(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let query = format!(
        "SELECT {} FROM reminders WHERE id = ?1",
        SELECT_REMINDER_FIELDS
    );

    let current_status: String = conn
        .query_row(
            "SELECT status FROM reminders WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Reminder with id '{}' not found", id))?;

    let new_status = if current_status == "ativo" {
        "inativo"
    } else {
        "ativo"
    };

    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE reminders SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_status, now, id],
    )
    .map_err(|e| e.to_string())?;

    let updated_reminder = conn
        .query_row(&query, params![id], |row| map_reminder_row(row))
        .map_err(|e| e.to_string())?;

    Ok(updated_reminder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::reminder::ReminderFrequency;
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
        let now = Utc::now().to_rfc3339();

        let test_id = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

        // 1. Insert with CUSTOM frequency and custom_days
        conn.execute(
            "INSERT INTO reminders (
                id, title, message, description, category, interval, period,
                frequency, notification_tone, status, start_time, end_time, reminder_date, custom_days, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                test_id,
                "Drink Water",
                "Drink 250ml",
                Some("Drink 250ml"),
                "Hidratação",
                60,
                "08:00 - 18:00",
                "CUSTOM",
                1,
                "ativo",
                Some("08:00"),
                Some("18:00"),
                None::<&str>,
                Some(r#"["MON","WED","FRI"]"#),
                now,
                now,
            ],
        )
        .unwrap();

        // 2. Read
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {} FROM reminders WHERE id = ?1",
                SELECT_REMINDER_FIELDS
            ))
            .unwrap();
        let reminder = stmt
            .query_row(params![test_id], |row| map_reminder_row(row))
            .unwrap();

        assert_eq!(reminder.id, test_id);
        assert_eq!(reminder.title, "Drink Water");
        assert_eq!(reminder.interval, 60);
        assert_eq!(reminder.frequency, ReminderFrequency::Custom);
        assert_eq!(
            reminder.custom_days,
            Some(vec![
                "MON".to_string(),
                "WED".to_string(),
                "FRI".to_string()
            ])
        );
        assert_eq!(reminder.notification_tone, true);
        assert_eq!(reminder.status, "ativo");

        // 3. Update to ONCE (clearing custom_days)
        conn.execute(
            "UPDATE reminders SET title = ?1, status = ?2, frequency = ?3, custom_days = NULL, reminder_date = ?4 WHERE id = ?5",
            params!["Drink More Water", "inativo", "ONCE", "2026-09-16", test_id],
        )
        .unwrap();

        let updated_reminder = stmt
            .query_row(params![test_id], |row| map_reminder_row(row))
            .unwrap();
        assert_eq!(updated_reminder.title, "Drink More Water");
        assert_eq!(updated_reminder.status, "inativo");
        assert_eq!(updated_reminder.frequency, ReminderFrequency::Once);
        assert_eq!(updated_reminder.custom_days, None);
        assert_eq!(updated_reminder.reminder_date, Some("2026-09-16".to_string()));

        // 4. Update to DAILY (clearing reminder_date)
        conn.execute(
            "UPDATE reminders SET title = ?1, status = ?2, frequency = ?3, custom_days = NULL, reminder_date = NULL WHERE id = ?4",
            params!["Drink More Water", "ativo", "DAILY", test_id],
        )
        .unwrap();

        let updated_to_daily = stmt
            .query_row(params![test_id], |row| map_reminder_row(row))
            .unwrap();
        assert_eq!(updated_to_daily.frequency, ReminderFrequency::Daily);
        assert_eq!(updated_to_daily.custom_days, None);
        assert_eq!(updated_to_daily.reminder_date, None);

        // 5. Delete
        let rows = conn
            .execute("DELETE FROM reminders WHERE id = ?1", params![test_id])
            .unwrap();
        assert_eq!(rows, 1);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reminders", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_validate_reminder_times() {
        // Valid: 08:00 to 18:00 (600m), interval 30m
        assert!(validate_reminder_times(Some("08:00"), Some("18:00"), 30).is_ok());

        // Valid: 09:00 to 10:00 (60m), interval 59m
        assert!(validate_reminder_times(Some("09:00"), Some("10:00"), 59).is_ok());

        // Invalid: interval equal to period duration (60m in 60m window)
        let err_equal = validate_reminder_times(Some("09:00"), Some("10:00"), 60);
        assert!(err_equal.is_err());
        assert!(err_equal.unwrap_err().contains("must be less than"));

        // Invalid: interval greater than period duration (120m in 60m window)
        let err_greater = validate_reminder_times(Some("09:00"), Some("10:00"), 120);
        assert!(err_greater.is_err());

        // Invalid: end time before or equal to start time
        let err_order = validate_reminder_times(Some("18:00"), Some("08:00"), 30);
        assert!(err_order.is_err());
        assert_eq!(err_order.unwrap_err(), "End time must be after start time");

        let err_same = validate_reminder_times(Some("08:00"), Some("08:00"), 30);
        assert!(err_same.is_err());

        // Invalid: interval <= 0
        let err_zero = validate_reminder_times(Some("08:00"), Some("18:00"), 0);
        assert!(err_zero.is_err());
        assert_eq!(err_zero.unwrap_err(), "Interval must be at least 1 minute");
    }
}
