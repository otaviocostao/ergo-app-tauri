use rusqlite::{params, Connection, OptionalExtension};
use crate::models::reminder::Reminder;

pub const SELECT_REMINDER_FIELDS: &str = "id, title, message, description, category, interval, period, frequency, notification_tone, status, start_time, end_time, reminder_date, custom_days, created_at, updated_at";

pub fn map_reminder_row(row: &rusqlite::Row<'_>) -> Result<Reminder, rusqlite::Error> {
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

pub fn find_all(conn: &Connection) -> Result<Vec<Reminder>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM reminders ORDER BY datetime(created_at) DESC, id DESC",
        SELECT_REMINDER_FIELDS
    );

    let mut stmt = conn.prepare(&query)?;
    let reminder_iter = stmt.query_map([], |row| map_reminder_row(row))?;

    let mut reminders = Vec::new();
    for reminder in reminder_iter {
        reminders.push(reminder?);
    }

    Ok(reminders)
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<Reminder>, rusqlite::Error> {
    let query = format!(
        "SELECT {} FROM reminders WHERE id = ?1",
        SELECT_REMINDER_FIELDS
    );

    conn.query_row(&query, params![id], |row| map_reminder_row(row))
        .optional()
}

pub fn insert(conn: &Connection, reminder: &Reminder) -> Result<(), rusqlite::Error> {
    let notification_tone_int = if reminder.notification_tone { 1 } else { 0 };
    let custom_days_json: Option<String> = reminder
        .custom_days
        .as_ref()
        .and_then(|days| serde_json::to_string(days).ok());

    conn.execute(
        "INSERT INTO reminders (
            id, title, message, description, category, interval, period,
            frequency, notification_tone, status, start_time, end_time, reminder_date, custom_days, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            reminder.id,
            reminder.title,
            reminder.message,
            reminder.description,
            reminder.category,
            reminder.interval,
            reminder.period,
            reminder.frequency,
            notification_tone_int,
            reminder.status,
            reminder.start_time,
            reminder.end_time,
            reminder.reminder_date,
            custom_days_json,
            reminder.created_at,
            reminder.updated_at,
        ],
    )?;

    Ok(())
}

pub fn update(conn: &Connection, reminder: &Reminder) -> Result<usize, rusqlite::Error> {
    let notification_tone_int = if reminder.notification_tone { 1 } else { 0 };
    let custom_days_json: Option<String> = reminder
        .custom_days
        .as_ref()
        .and_then(|days| serde_json::to_string(days).ok());

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
            reminder.title,
            reminder.message,
            reminder.description,
            reminder.category,
            reminder.interval,
            reminder.period,
            reminder.frequency,
            notification_tone_int,
            reminder.status,
            reminder.start_time,
            reminder.end_time,
            reminder.reminder_date,
            custom_days_json,
            reminder.updated_at,
            reminder.id,
        ],
    )
}

pub fn delete(conn: &Connection, id: &str) -> Result<usize, rusqlite::Error> {
    conn.execute("DELETE FROM reminders WHERE id = ?1", params![id])
}

pub fn update_status(
    conn: &Connection,
    id: &str,
    status: &str,
    updated_at: &str,
) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "UPDATE reminders SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, updated_at, id],
    )
}
