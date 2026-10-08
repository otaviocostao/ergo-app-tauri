use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration as StdDuration;

use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, TimeZone, Weekday};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::db::AppState;
use crate::models::reminder::{Reminder, ReminderAlarm, ReminderFrequency};
use crate::repositories::reminder_repository;
use crate::services::auth_service::AuthState;
use crate::services::reminder_service::parse_time_to_minutes;

const MAX_DELAY_SECONDS: i64 = 10;

fn matches_day(reminder: &Reminder, date: NaiveDate) -> bool {
    let day = date.weekday();
    match reminder.frequency {
        ReminderFrequency::Daily => true,
        ReminderFrequency::BusinessDays => !matches!(day, Weekday::Sat | Weekday::Sun),
        ReminderFrequency::Weekends => matches!(day, Weekday::Sat | Weekday::Sun),
        ReminderFrequency::Once => {
            reminder
                .reminder_date
                .as_deref()
                .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
                == Some(date)
        }
        ReminderFrequency::Custom => {
            let key = match day {
                Weekday::Mon => "MON",
                Weekday::Tue => "TUE",
                Weekday::Wed => "WED",
                Weekday::Thu => "THU",
                Weekday::Fri => "FRI",
                Weekday::Sat => "SAT",
                Weekday::Sun => "SUN",
            };
            reminder
                .custom_days
                .as_ref()
                .is_some_and(|days| days.iter().any(|value| value == key))
        }
    }
}

// Use local calendar times, rather than adding 24 hours across day boundaries.
pub fn next_occurrence<Tz: TimeZone>(
    reminder: &Reminder,
    after: &DateTime<Tz>,
) -> Option<DateTime<Tz>> {
    if reminder.status != "ativo" || reminder.user_id.is_none() || reminder.interval <= 0 {
        return None;
    }
    let start = parse_time_to_minutes(reminder.start_time.as_deref()?)?;
    let timezone = after.timezone();

    if reminder.frequency == ReminderFrequency::Once {
        let date =
            NaiveDate::parse_from_str(reminder.reminder_date.as_deref()?, "%Y-%m-%d").ok()?;
        let time = date.and_hms_opt((start / 60) as u32, (start % 60) as u32, 0)?;
        // Skip ambiguous or nonexistent local times instead of firing twice.
        return timezone
            .from_local_datetime(&time)
            .single()
            .filter(|due| due > after);
    }

    let end = parse_time_to_minutes(reminder.end_time.as_deref()?)?;
    if end <= start {
        return None;
    }
    if reminder.interval >= end - start {
        return None;
    }
    for offset in 0..=7 {
        let date = after
            .date_naive()
            .checked_add_signed(Duration::days(offset))?;
        if !matches_day(reminder, date) {
            continue;
        }
        let mut minute = start + reminder.interval;
        while minute < end {
            let time = date.and_hms_opt((minute / 60) as u32, (minute % 60) as u32, 0)?;
            if let Some(due) = timezone.from_local_datetime(&time).single() {
                if due > *after {
                    return Some(due);
                }
            }
            minute += reminder.interval;
        }
    }
    None
}

struct ScheduledReminder<Tz: TimeZone> {
    reminder: Reminder,
    next: Option<DateTime<Tz>>,
    last_fired: Option<DateTime<Tz>>,
}

pub struct ReminderScheduler<Tz: TimeZone> {
    user_id: Option<i64>,
    entries: HashMap<String, ScheduledReminder<Tz>>,
}

impl<Tz: TimeZone> Default for ReminderScheduler<Tz> {
    fn default() -> Self {
        Self {
            user_id: None,
            entries: HashMap::new(),
        }
    }
}

impl<Tz: TimeZone> ReminderScheduler<Tz> {
    pub fn poll(
        &mut self,
        user_id: Option<i64>,
        reminders: &[Reminder],
        now: DateTime<Tz>,
    ) -> Vec<ReminderAlarm> {
        if self.user_id != user_id {
            self.entries.clear();
            self.user_id = user_id;
        }
        let Some(user_id) = user_id else {
            self.entries.clear();
            return vec![];
        };
        self.entries.retain(|id, _| {
            reminders
                .iter()
                .any(|r| r.id == *id && r.user_id == Some(user_id) && r.status == "ativo")
        });
        let mut alarms = Vec::new();
        for reminder in reminders
            .iter()
            .filter(|r| r.user_id == Some(user_id) && r.status == "ativo")
        {
            let entry =
                self.entries
                    .entry(reminder.id.clone())
                    .or_insert_with(|| ScheduledReminder {
                        reminder: reminder.clone(),
                        next: next_occurrence(reminder, &now),
                        last_fired: None,
                    });
            if entry.reminder != *reminder {
                let after = entry
                    .last_fired
                    .as_ref()
                    .filter(|last| **last > now)
                    .unwrap_or(&now);
                entry.next = next_occurrence(reminder, after);
                entry.reminder = reminder.clone();
            }
            let Some(due) = entry.next.clone() else {
                continue;
            };
            if due > now {
                continue;
            }
            if now.clone().signed_duration_since(&due).num_seconds() <= MAX_DELAY_SECONDS {
                alarms.push(ReminderAlarm {
                    id: reminder.id.clone(),
                    user_id,
                    title: reminder.title.clone(),
                    message: reminder.message.clone(),
                    notification_tone: reminder.notification_tone,
                    scheduled_at: due.to_rfc3339(),
                });
                entry.last_fired = Some(due);
            }
            // Skip missed slots after sleep/restart; never replay a backlog.
            entry.next = next_occurrence(reminder, &now);
        }
        alarms
    }
}

pub struct SchedulerControl(Arc<AtomicBool>);

impl SchedulerControl {
    pub fn stop(&self) {
        self.0.store(true, Ordering::Relaxed);
    }
}

pub fn start(app: AppHandle) -> std::io::Result<SchedulerControl> {
    let stop = Arc::new(AtomicBool::new(false));
    let worker_stop = stop.clone();
    std::thread::Builder::new()
        .name("reminder-scheduler".into())
        .spawn(move || {
            let mut scheduler = ReminderScheduler::<Local>::default();
            while !worker_stop.load(Ordering::Relaxed) {
                if let Err(error) = poll_app(&app, &mut scheduler) {
                    eprintln!("Reminder scheduler failed: {error}");
                }
                std::thread::sleep(StdDuration::from_secs(1));
            }
        })?;
    Ok(SchedulerControl(stop))
}

fn poll_app(app: &AppHandle, scheduler: &mut ReminderScheduler<Local>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let auth = app.state::<AuthState>();
    // Hold the session lock through dispatch so logout/account changes cannot
    // interleave with an alarm belonging to the previous account.
    auth.with_authenticated_user(|user_id| {
        let reminders = match user_id {
            Some(id) => reminder_repository::find_all(&conn, id).map_err(|e| e.to_string())?,
            None => vec![],
        };
        for alarm in scheduler.poll(user_id, &reminders, Local::now()) {
            let mut notification = app
                .notification()
                .builder()
                .title(&alarm.title)
                .body(&alarm.message);
            // On Windows, no sound resource results in a silent toast.
            if alarm.notification_tone {
                notification = notification.sound("Default");
            }
            if let Err(error) = notification.show() {
                eprintln!("Failed to prepare reminder notification: {error}");
            }
            app.emit("reminder-alarm", &alarm)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn at(day: u32, hour: u32, minute: u32, second: u32) -> DateTime<FixedOffset> {
        FixedOffset::west_opt(3 * 3600)
            .unwrap()
            .with_ymd_and_hms(2026, 10, day, hour, minute, second)
            .unwrap()
    }

    fn reminder() -> Reminder {
        serde_json::from_value(serde_json::json!({
            "id": "water", "userId": 1, "title": "Drink water", "message": "Drink 250ml",
            "category": "Hidratação", "interval": 60, "period": "08:00 - 18:00",
            "frequency": "DAILY", "notificationTone": true, "status": "ativo",
            "startTime": "08:00", "endTime": "18:00"
        }))
        .unwrap()
    }

    #[test]
    fn recurring_slots_are_anchored_to_start_and_end_is_exclusive() {
        let r = reminder();
        assert_eq!(next_occurrence(&r, &at(6, 7, 0, 0)), Some(at(6, 9, 0, 0)));
        assert_eq!(next_occurrence(&r, &at(6, 8, 30, 0)), Some(at(6, 9, 0, 0)));
        assert_eq!(next_occurrence(&r, &at(6, 9, 0, 0)), Some(at(6, 10, 0, 0)));
        assert_eq!(next_occurrence(&r, &at(6, 17, 0, 0)), Some(at(7, 9, 0, 0)));
        assert_eq!(next_occurrence(&r, &at(6, 18, 0, 0)), Some(at(7, 9, 0, 0)));
        let mut r = r;
        r.interval = 45;
        assert_eq!(next_occurrence(&r, &at(6, 8, 46, 0)), Some(at(6, 9, 30, 0)));
    }

    #[test]
    fn frequencies_use_local_weekdays() {
        let mut r = reminder();
        r.frequency = ReminderFrequency::BusinessDays;
        assert_eq!(next_occurrence(&r, &at(9, 18, 0, 0)), Some(at(12, 9, 0, 0)));
        r.frequency = ReminderFrequency::Weekends;
        assert_eq!(next_occurrence(&r, &at(6, 8, 0, 0)), Some(at(10, 9, 0, 0)));
        assert_eq!(
            next_occurrence(&r, &at(11, 18, 0, 0)),
            Some(at(17, 9, 0, 0))
        );
        r.frequency = ReminderFrequency::Custom;
        r.custom_days = Some(vec!["MON".into(), "WED".into()]);
        assert_eq!(next_occurrence(&r, &at(6, 8, 0, 0)), Some(at(7, 9, 0, 0)));
        r.custom_days = Some(vec!["TUE".into()]);
        assert_eq!(next_occurrence(&r, &at(6, 17, 0, 0)), Some(at(13, 9, 0, 0)));
    }

    #[test]
    fn once_fires_at_start_time_only_on_selected_date() {
        let mut r = reminder();
        r.frequency = ReminderFrequency::Once;
        r.reminder_date = Some("2026-10-06".into());
        r.end_time = None;
        assert_eq!(next_occurrence(&r, &at(5, 20, 0, 0)), Some(at(6, 8, 0, 0)));
        assert_eq!(next_occurrence(&r, &at(6, 8, 0, 0)), None);
        let mut scheduler = ReminderScheduler::default();
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 7, 59, 59))
            .is_empty());
        assert_eq!(
            scheduler.poll(Some(1), &[r.clone()], at(6, 8, 0, 0)).len(),
            1
        );
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 9, 0, 0))
            .is_empty());
        let mut restarted = ReminderScheduler::default();
        assert!(restarted.poll(Some(1), &[r], at(6, 8, 0, 1)).is_empty());
    }

    #[test]
    fn polling_once_per_second_does_not_duplicate_alarms() {
        let r = reminder();
        let mut scheduler = ReminderScheduler::default();
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 8, 59, 58))
            .is_empty());
        let alarms = scheduler.poll(Some(1), &[r.clone()], at(6, 9, 0, 1));
        assert_eq!(alarms.len(), 1);
        assert_eq!(alarms[0].scheduled_at, at(6, 9, 0, 0).to_rfc3339());
        assert!(alarms[0].notification_tone);
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 9, 0, 2))
            .is_empty());
        assert_eq!(scheduler.poll(Some(1), &[r], at(6, 10, 0, 0)).len(), 1);
    }

    #[test]
    fn suspension_and_restart_skip_missed_slots() {
        let r = reminder();
        let mut scheduler = ReminderScheduler::default();
        scheduler.poll(Some(1), &[r.clone()], at(6, 8, 59, 0));
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 11, 30, 0))
            .is_empty());
        assert_eq!(
            scheduler.poll(Some(1), &[r.clone()], at(6, 12, 0, 0)).len(),
            1
        );
        let mut restarted = ReminderScheduler::default();
        assert!(restarted
            .poll(Some(1), &[r.clone()], at(6, 12, 0, 1))
            .is_empty());
        assert_eq!(restarted.poll(Some(1), &[r], at(6, 13, 0, 0)).len(), 1);
    }

    #[test]
    fn editing_disabling_deleting_and_logout_cancel_old_schedules() {
        let mut r = reminder();
        let mut scheduler = ReminderScheduler::default();
        scheduler.poll(Some(1), &[r.clone()], at(6, 8, 59, 0));
        r.interval = 120;
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 8, 59, 30))
            .is_empty());
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 9, 0, 0))
            .is_empty());
        assert_eq!(
            scheduler.poll(Some(1), &[r.clone()], at(6, 10, 0, 0)).len(),
            1
        );
        r.status = "inativo".into();
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 12, 0, 0))
            .is_empty());
        r.status = "ativo".into();
        scheduler.poll(Some(1), &[r.clone()], at(6, 12, 1, 0));
        assert!(scheduler.poll(Some(1), &[], at(6, 14, 0, 0)).is_empty());
        scheduler.poll(Some(1), &[r.clone()], at(6, 14, 1, 0));
        assert!(scheduler.poll(None, &[r], at(6, 16, 0, 0)).is_empty());
    }

    #[test]
    fn account_change_cannot_dispatch_another_users_alarm() {
        let first = reminder();
        let mut second = first.clone();
        second.id = "other".into();
        second.user_id = Some(2);
        let mut scheduler = ReminderScheduler::default();
        scheduler.poll(Some(1), &[first.clone(), second.clone()], at(6, 8, 59, 0));
        assert!(scheduler
            .poll(Some(2), &[first.clone(), second.clone()], at(6, 8, 59, 30))
            .is_empty());
        let alarms = scheduler.poll(Some(2), &[first, second], at(6, 9, 0, 0));
        assert_eq!(alarms.len(), 1);
        assert_eq!(alarms[0].user_id, 2);
    }

    #[test]
    fn invalid_schedules_and_unowned_reminders_do_not_fire() {
        let mut r = reminder();
        r.interval = 0;
        assert!(next_occurrence(&r, &at(6, 7, 0, 0)).is_none());
        r.interval = 60;
        r.start_time = Some("25:00".into());
        assert!(next_occurrence(&r, &at(6, 7, 0, 0)).is_none());
        r.start_time = Some("08:00".into());
        r.user_id = None;
        assert!(next_occurrence(&r, &at(6, 7, 0, 0)).is_none());
    }

    #[test]
    fn silent_reminders_and_backward_clock_changes_are_respected() {
        let mut r = reminder();
        r.notification_tone = false;
        let mut scheduler = ReminderScheduler::default();
        scheduler.poll(Some(1), &[r.clone()], at(6, 8, 59, 0));
        let alarms = scheduler.poll(Some(1), &[r.clone()], at(6, 9, 0, 0));
        assert_eq!(alarms.len(), 1);
        assert!(!alarms[0].notification_tone);
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 8, 59, 0))
            .is_empty());
        r.title = "Edited after clock change".into();
        scheduler.poll(Some(1), &[r.clone()], at(6, 8, 59, 30));
        assert!(scheduler
            .poll(Some(1), &[r.clone()], at(6, 9, 0, 0))
            .is_empty());
        assert_eq!(scheduler.poll(Some(1), &[r], at(6, 10, 0, 0)).len(), 1);
    }
}
