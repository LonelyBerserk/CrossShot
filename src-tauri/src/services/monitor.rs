use crate::models::monitor::MonitorInfo;
use xcap::Monitor;

/// Returns metadata for every display detected by XCap.
pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    let monitors =
        Monitor::all().map_err(|error| format!("Failed to enumerate monitors: {error}"))?;

    monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| read_monitor_info(monitor, index))
        .collect()
}

/// Converts an XCap monitor into the application data model.
fn read_monitor_info(monitor: &Monitor, index: usize) -> Result<MonitorInfo, String> {
    let context = format!("Monitor #{}", index + 1);

    Ok(MonitorInfo {
        id: monitor
            .id()
            .map_err(|error| format!("{context}: failed to read ID: {error}"))?,
        name: monitor
            .name()
            .map_err(|error| format!("{context}: failed to read name: {error}"))?,
        friendly_name: monitor
            .friendly_name()
            .map_err(|error| format!("{context}: failed to read friendly name: {error}"))?,
        x: monitor
            .x()
            .map_err(|error| format!("{context}: failed to read X coordinate: {error}"))?,
        y: monitor
            .y()
            .map_err(|error| format!("{context}: failed to read Y coordinate: {error}"))?,
        width: monitor
            .width()
            .map_err(|error| format!("{context}: failed to read width: {error}"))?,
        height: monitor
            .height()
            .map_err(|error| format!("{context}: failed to read height: {error}"))?,
        scale_factor: monitor
            .scale_factor()
            .map_err(|error| format!("{context}: failed to read scale factor: {error}"))?,
        is_primary: monitor
            .is_primary()
            .map_err(|error| format!("{context}: failed to read primary status: {error}"))?,
    })
}
