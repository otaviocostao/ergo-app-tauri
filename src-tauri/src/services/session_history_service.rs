use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, Utc};
use rusqlite::Connection;

use super::auth_service::AuthState;
use crate::models::{
    posture_metric_snapshot::PostureStatus,
    session_history::{HistoryMinute, HistoryMinuteState, SessionHistory},
};
use crate::repositories::session_history_repository;

fn parse_time(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Utc))
        .or_else(|_| {
            NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S").map(|time| time.and_utc())
        })
        .map_err(|_| "Invalid stored monitoring timestamp".to_string())
}

fn iso(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn get_session_history(
    conn: &Connection,
    auth_state: &AuthState,
) -> Result<SessionHistory, String> {
    read_at(conn, auth_state, Utc::now())
}

fn read_at(
    conn: &Connection,
    auth_state: &AuthState,
    now: DateTime<Utc>,
) -> Result<SessionHistory, String> {
    auth_state.with_authenticated_user(|user_id| {
        let user_id = user_id
            .ok_or_else(|| "Authentication is required to read session history".to_string())?;
        let mut session = session_history_repository::find_latest_session(conn, user_id)
            .map_err(|error| error.to_string())?;
        // SQLite's legacy datetime strings are UTC even though they omit a timezone.
        if let Some(session) = &mut session {
            session.started_at = iso(parse_time(&session.started_at)?);
            session.ended_at = session
                .ended_at
                .as_deref()
                .map(parse_time)
                .transpose()?
                .map(iso);
        }
        // A completed session keeps its last fifteen minutes visible after reopening the app.
        let end = session
            .as_ref()
            .and_then(|item| item.ended_at.as_deref())
            .map(parse_time)
            .transpose()?
            .unwrap_or(now)
            .min(now);
        let session_start = session
            .as_ref()
            .map(|item| parse_time(&item.started_at))
            .transpose()?
            .unwrap_or(end);
        let completed = end
            .signed_duration_since(session_start)
            .num_milliseconds()
            .max(0)
            / 60_000;
        let first_cycle = (completed - 15).max(0);
        let start = session_start + Duration::minutes(first_cycle);
        let mut history = SessionHistory {
            session,
            window_start: iso(start),
            window_end: iso(end),
            timeline: (0..15)
                .map(|index| HistoryMinute {
                    started_at: iso(start + Duration::minutes(index)),
                    ended_at: iso(start + Duration::minutes(index + 1)),
                    status: None,
                    samples_count: 0,
                    summaries_count: 0,
                    state: if start + Duration::minutes(index + 1) <= end {
                        HistoryMinuteState::Unavailable
                    } else {
                        HistoryMinuteState::Pending
                    },
                })
                .collect(),
            adequate_summary_percentage: None,
            alerts: Vec::new(),
        };
        if let Some(session) = &history.session {
            let snapshots = session_history_repository::find_window_snapshots(
                conn,
                &session.id,
                &history.window_start,
                &history.window_end,
            )
            .map_err(|error| error.to_string())?;
            let mut counts = [[0_i64; 3]; 15];
            let mut absences = [false; 15];
            let mut unavailable = [false; 15];
            for snapshot in snapshots {
                let timestamp = parse_time(&snapshot.timestamp)?;
                if timestamp < session_start {
                    continue;
                }
                // The timestamp closes a session-aligned minute. Historical delayed writes
                // still belong to the most recently completed cycle, not to a shifting window.
                let index = timestamp
                    .signed_duration_since(session_start)
                    .num_milliseconds()
                    / 60_000
                    - 1
                    - first_cycle;
                if !(0..15).contains(&index) {
                    continue;
                }
                let index = index as usize;
                let status_index = match snapshot.dominant_status {
                    PostureStatus::Good => 0,
                    PostureStatus::Warning => 1,
                    PostureStatus::Danger => 2,
                    PostureStatus::Absent => {
                        absences[index] = true;
                        history.timeline[index].summaries_count += 1;
                        continue;
                    }
                    PostureStatus::Unavailable => {
                        unavailable[index] = true;
                        history.timeline[index].summaries_count += 1;
                        continue;
                    }
                };
                if snapshot.samples_count <= 0 {
                    continue;
                }
                counts[index][status_index] += snapshot.samples_count;
                history.timeline[index].samples_count += snapshot.samples_count;
                history.timeline[index].summaries_count += 1;
            }
            let mut good = 0;
            let mut total = 0;
            for (index, (minute, statuses)) in history.timeline.iter_mut().zip(counts).enumerate() {
                if minute.samples_count == 0 {
                    if absences[index] && !unavailable[index] {
                        minute.state = HistoryMinuteState::Absent;
                    }
                    continue;
                }
                // Prefer the more severe status on ties; missing minutes remain unavailable.
                let index = (0..3)
                    .max_by_key(|index| (statuses[*index], *index))
                    .unwrap();
                minute.status = Some(
                    [
                        PostureStatus::Good,
                        PostureStatus::Warning,
                        PostureStatus::Danger,
                    ][index],
                );
                minute.state = HistoryMinuteState::Recorded;
                total += 1;
                if minute.status == Some(PostureStatus::Good) {
                    good += 1;
                }
            }
            if total > 0 {
                history.adequate_summary_percentage = Some(good as f64 * 100.0 / total as f64);
            }
            history.alerts = session_history_repository::find_recent_alerts(
                conn,
                &session.id,
                &history.window_end,
            )
            .map_err(|error| error.to_string())?;
            for alert in &mut history.alerts {
                alert.timestamp = iso(parse_time(&alert.timestamp)?);
                alert.resolved_at = alert
                    .resolved_at
                    .as_deref()
                    .map(parse_time)
                    .transpose()?
                    .map(iso);
            }
        }
        Ok(history)
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{models::auth::Session, repositories::user_repository, services::auth_service};

    fn database() -> (Connection, AuthState) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/0001_initial_migration.sql"))
            .unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;
            INSERT INTO users (id, first_name, last_name, birth_date, password_hash, email, phone)
            VALUES ('00000000-0000-4000-8000-000000000001', 'One', 'User', '', 'hash', 'one@example.com', ''), ('00000000-0000-4000-8000-000000000002', 'Two', 'User', '', 'hash', 'two@example.com', '');
            INSERT INTO monitoring_sessions (id, user_id, started_at) VALUES
            ('old', '00000000-0000-4000-8000-000000000001', '2026-11-04T10:00:00Z'), ('current', '00000000-0000-4000-8000-000000000001', '2026-11-05T12:00:00Z'),
            ('other', '00000000-0000-4000-8000-000000000002', '2026-11-05T12:01:00Z'), ('guest', NULL, '2026-11-05T12:02:00Z');").unwrap();
        let auth = AuthState::new().unwrap();
        authenticate(&conn, &auth, "00000000-0000-4000-8000-000000000001");
        (conn, auth)
    }

    fn authenticate(conn: &Connection, auth: &AuthState, id: &str) {
        let user = user_repository::find_by_id(conn, id).unwrap().unwrap().user;
        auth_service::set_session(
            auth,
            Session::Authenticated {
                user: Box::new(user),
            },
        )
        .unwrap();
    }

    fn snapshot(
        conn: &Connection,
        id: &str,
        session: &str,
        timestamp: &str,
        status: &str,
        count: i64,
    ) {
        conn.execute("INSERT INTO posture_metrics_snapshots (id, session_id, timestamp, dominant_status, score, samples_count)
            VALUES (?1, ?2, ?3, ?4, 87, ?5)", rusqlite::params![id, session, timestamp, status, count]).unwrap();
    }

    fn history(conn: &Connection, auth: &AuthState) -> SessionHistory {
        read_at(conn, auth, parse_time("2026-11-05T12:15:00Z").unwrap()).unwrap()
    }

    #[test]
    fn requires_authentication_and_reads_only_the_latest_session_of_the_rust_owner() {
        let (conn, auth) = database();
        let anonymous = AuthState::new().unwrap();
        assert!(get_session_history(&conn, &anonymous).is_err());
        auth_service::set_session(&anonymous, Session::Guest).unwrap();
        assert!(get_session_history(&conn, &anonymous).is_err());
        for session in ["old", "current", "other", "guest"] {
            snapshot(&conn, session, session, "2026-11-05T12:05:00Z", "good", 600);
            conn.execute("INSERT INTO posture_alerts (id, session_id, timestamp, alert_type, severity, message)
                VALUES (?1, ?1, '2026-11-05T12:05:00Z', 'neck_posture', 'warning', ?1)", [session]).unwrap();
        }
        let data = history(&conn, &auth);
        assert_eq!(data.session.unwrap().id, "current");
        assert_eq!(
            data.timeline
                .iter()
                .map(|item| item.summaries_count)
                .sum::<i64>(),
            1
        );
        assert_eq!(data.alerts.len(), 1);
        assert_eq!(data.alerts[0].id, "current");
        authenticate(&conn, &auth, "00000000-0000-4000-8000-000000000002");
        let data = history(&conn, &auth);
        assert_eq!(data.session.unwrap().id, "other");
        assert_eq!(data.alerts[0].id, "other");
        conn.execute("DELETE FROM monitoring_sessions WHERE user_id = '00000000-0000-4000-8000-000000000002'", [])
            .unwrap();
        let data = history(&conn, &auth);
        assert!(data.session.is_none());
        assert!(data.alerts.is_empty());
        assert!(data.timeline.iter().all(|item| item.status.is_none()));
    }

    #[test]
    fn derives_colors_and_percentage_from_saved_summaries_without_treating_gaps_as_good() {
        let (conn, auth) = database();
        for (id, timestamp, status) in [
            ("g1", "2026-11-05T12:01:00Z", "good"),
            ("g2", "2026-11-05T12:02:00Z", "good"),
            ("w", "2026-11-05T12:03:00Z", "warning"),
            ("d", "2026-11-05T12:04:00Z", "danger"),
        ] {
            snapshot(&conn, id, "current", timestamp, status, 600);
        }
        snapshot(&conn, "empty", "current", "2026-11-05T12:05:00Z", "good", 0);
        let data = history(&conn, &auth);
        assert_eq!(data.timeline.len(), 15);
        assert_eq!(data.adequate_summary_percentage, Some(50.0));
        assert_eq!(data.timeline[0].status, Some(PostureStatus::Good));
        assert_eq!(data.timeline[2].status, Some(PostureStatus::Warning));
        assert_eq!(data.timeline[3].status, Some(PostureStatus::Danger));
        assert!(data.timeline[4..]
            .iter()
            .all(|item| item.status.is_none() && item.samples_count == 0));
    }

    #[test]
    fn handles_window_boundaries_offsets_and_severity_ties() {
        let (conn, auth) = database();
        snapshot(
            &conn,
            "start",
            "current",
            "2026-11-05T12:00:00Z",
            "good",
            600,
        );
        snapshot(
            &conn,
            "after",
            "current",
            "2026-11-05T12:15:00.010Z",
            "good",
            600,
        );
        snapshot(
            &conn,
            "end",
            "current",
            "2026-11-05T09:15:00-03:00",
            "warning",
            600,
        );
        snapshot(
            &conn,
            "tie-good",
            "current",
            "2026-11-05T12:05:10Z",
            "good",
            600,
        );
        snapshot(
            &conn,
            "tie-danger",
            "current",
            "2026-11-05T12:05:20Z",
            "danger",
            600,
        );
        let data = history(&conn, &auth);
        assert_eq!(data.timeline[14].status, Some(PostureStatus::Warning));
        assert_eq!(data.timeline[4].status, Some(PostureStatus::Danger));
        assert_eq!(data.timeline[4].samples_count, 1200);
        assert_eq!(data.timeline[4].summaries_count, 2);
        assert!(data.timeline[0].status.is_none());
        assert_eq!(
            data.timeline
                .iter()
                .map(|item| item.summaries_count)
                .sum::<i64>(),
            3
        );
    }

    #[test]
    fn keeps_a_completed_session_window_and_returns_no_percentage_without_measurements() {
        let (conn, auth) = database();
        // The session's initial 100% defaults must never be shown as measured history.
        assert!(history(&conn, &auth).adequate_summary_percentage.is_none());
        conn.execute(
            "UPDATE monitoring_sessions SET ended_at = '2026-11-05T12:10:00Z' WHERE id = 'current'",
            [],
        )
        .unwrap();
        snapshot(
            &conn,
            "saved",
            "current",
            "2026-11-05T12:09:00Z",
            "good",
            600,
        );
        snapshot(
            &conn,
            "invalid-late",
            "current",
            "2026-11-05T12:11:00Z",
            "danger",
            600,
        );
        let data = history(&conn, &auth);
        assert_eq!(data.window_end, "2026-11-05T12:10:00.000Z");
        assert_eq!(data.adequate_summary_percentage, Some(100.0));
        assert_eq!(
            data.timeline
                .iter()
                .map(|item| item.summaries_count)
                .sum::<i64>(),
            1
        );
    }

    #[test]
    fn returns_the_latest_hundred_alerts_with_recorded_resolution_and_duration() {
        let (conn, auth) = database();
        for index in 0..101 {
            conn.execute("INSERT INTO posture_alerts (id, session_id, timestamp, alert_type, severity, duration_seconds, message, resolved_at)
                VALUES (?1, 'current', '2026-11-05T12:05:00Z', 'neck_posture', 'danger', 42, 'Recorded alert', '2026-11-05T12:06:00Z')", [format!("alert-{index}")]).unwrap();
        }
        let data = history(&conn, &auth);
        assert_eq!(data.alerts.len(), 100);
        assert_eq!(data.alerts[0].id, "alert-100");
        assert_eq!(data.alerts[0].duration_seconds, 42);
        assert!(data.alerts[0].resolved_at.is_some());
        assert!(!data.alerts.iter().any(|alert| alert.id == "alert-0"));
    }

    #[test]
    fn normalizes_legacy_sqlite_dates_and_explicit_offsets_for_local_display() {
        let (conn, auth) = database();
        conn.execute("UPDATE monitoring_sessions SET started_at = '2026-11-05 12:00:00', ended_at = '2026-11-05 12:10:00' WHERE id = 'current'", []).unwrap();
        conn.execute("INSERT INTO posture_alerts (id, session_id, timestamp, alert_type, severity, message, resolved_at)
            VALUES ('legacy', 'current', '2026-11-05 12:05:00', 'neck_posture', 'warning', 'Legacy event', '2026-11-05T09:06:00-03:00')", []).unwrap();
        let data = history(&conn, &auth);
        assert_eq!(data.session.unwrap().started_at, "2026-11-05T12:00:00.000Z");
        assert_eq!(data.alerts[0].timestamp, "2026-11-05T12:05:00.000Z");
        assert_eq!(
            data.alerts[0].resolved_at.as_deref(),
            Some("2026-11-05T12:06:00.000Z")
        );
    }

    #[test]
    fn fills_the_first_minute_exactly_at_its_session_deadline_without_drifting_on_refresh() {
        let (conn, auth) = database();
        conn.execute("UPDATE monitoring_sessions SET started_at = '2026-11-05T18:25:00Z' WHERE id = 'current'", []).unwrap();
        snapshot(
            &conn,
            "first",
            "current",
            "2026-11-05T18:26:00Z",
            "good",
            540,
        );
        let before = read_at(
            &conn,
            &auth,
            parse_time("2026-11-05T18:25:59.999Z").unwrap(),
        )
        .unwrap();
        assert_eq!(before.timeline[0].state, HistoryMinuteState::Pending);
        assert!(before.timeline[0].status.is_none());
        for time in ["2026-11-05T18:26:00Z", "2026-11-05T18:26:30Z"] {
            let data = read_at(&conn, &auth, parse_time(time).unwrap()).unwrap();
            assert_eq!(data.timeline[0].started_at, "2026-11-05T18:25:00.000Z");
            assert_eq!(data.timeline[0].ended_at, "2026-11-05T18:26:00.000Z");
            assert_eq!(data.timeline[0].state, HistoryMinuteState::Recorded);
            assert_eq!(data.timeline[0].samples_count, 540);
            assert_eq!(data.timeline[1].state, HistoryMinuteState::Pending);
        }
    }

    #[test]
    fn distinguishes_full_absence_from_missing_readings_and_counts_partial_valid_minutes() {
        let (conn, auth) = database();
        snapshot(
            &conn,
            "absent",
            "current",
            "2026-11-05T12:01:00Z",
            "absent",
            0,
        );
        snapshot(
            &conn,
            "unavailable",
            "current",
            "2026-11-05T12:02:00Z",
            "unavailable",
            0,
        );
        snapshot(
            &conn,
            "partial-valid",
            "current",
            "2026-11-05T12:03:00Z",
            "good",
            42,
        );
        let data = read_at(&conn, &auth, parse_time("2026-11-05T12:04:00Z").unwrap()).unwrap();
        assert_eq!(data.timeline[0].state, HistoryMinuteState::Absent);
        assert_eq!(data.timeline[1].state, HistoryMinuteState::Unavailable);
        assert_eq!(data.timeline[2].state, HistoryMinuteState::Recorded);
        assert_eq!(data.timeline[2].samples_count, 42);
        assert_eq!(data.timeline[3].state, HistoryMinuteState::Unavailable);
        assert_eq!(data.timeline[4].state, HistoryMinuteState::Pending);
        assert_eq!(data.adequate_summary_percentage, Some(100.0));
    }

    #[test]
    fn retains_fifteen_completed_session_cycles_and_only_shifts_when_another_minute_finishes() {
        let (conn, auth) = database();
        let started = parse_time("2026-11-05T12:00:00Z").unwrap();
        for minute in 1..=20 {
            snapshot(
                &conn,
                &format!("minute-{minute}"),
                "current",
                &iso(started + Duration::minutes(minute)),
                "good",
                600,
            );
        }
        for time in ["2026-11-05T12:20:00Z", "2026-11-05T12:20:59.999Z"] {
            let data = read_at(&conn, &auth, parse_time(time).unwrap()).unwrap();
            assert_eq!(data.timeline[0].started_at, "2026-11-05T12:05:00.000Z");
            assert_eq!(data.timeline[14].ended_at, "2026-11-05T12:20:00.000Z");
            assert!(data
                .timeline
                .iter()
                .all(|minute| minute.state == HistoryMinuteState::Recorded));
        }
        let next = read_at(&conn, &auth, parse_time("2026-11-05T12:21:00Z").unwrap()).unwrap();
        assert_eq!(next.timeline[0].started_at, "2026-11-05T12:06:00.000Z");
        assert_eq!(next.timeline[14].state, HistoryMinuteState::Unavailable);
    }

    #[test]
    fn valid_readings_take_precedence_over_an_absence_marker_in_the_same_cycle() {
        let (conn, auth) = database();
        snapshot(
            &conn,
            "absence",
            "current",
            "2026-11-05T12:01:00Z",
            "absent",
            0,
        );
        snapshot(
            &conn,
            "reading",
            "current",
            "2026-11-05T12:01:00Z",
            "warning",
            100,
        );
        let data = history(&conn, &auth);
        assert_eq!(data.timeline[0].state, HistoryMinuteState::Recorded);
        assert_eq!(data.timeline[0].status, Some(PostureStatus::Warning));
    }
}
