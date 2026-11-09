use chrono::DateTime;
use rusqlite::Connection;

use super::auth_service::AuthState;
use crate::models::report::{ReportData, ReportFilter};
use crate::repositories::report_repository;

pub fn get_report_data(
    conn: &Connection,
    auth_state: &AuthState,
    filter: ReportFilter,
) -> Result<ReportData, String> {
    auth_state.with_authenticated_user(|user_id| {
        let user_id =
            user_id.ok_or_else(|| "Authentication is required to read reports".to_string())?;
        let start = DateTime::parse_from_rfc3339(&filter.start_time)
            .map_err(|_| "Invalid report start time".to_string())?;
        let end = DateTime::parse_from_rfc3339(&filter.end_time)
            .map_err(|_| "Invalid report end time".to_string())?;
        if end <= start {
            return Err("Report end time must follow start time".to_string());
        }
        let transaction = conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        let data = report_repository::find_period(
            &transaction,
            user_id,
            &filter.start_time,
            &filter.end_time,
        )
        .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(data)
    })?
}
