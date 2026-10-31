use crate::models::monitor::MonitorInfo;
use crate::services::monitor::list_monitors;

/// Returns the monitors currently detected by the operating system.
#[tauri::command]
pub async fn get_monitors() -> Result<Vec<MonitorInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_monitors)
        .await
        .map_err(|error| format!("Monitor enumeration task failed: {error}"))?
}
