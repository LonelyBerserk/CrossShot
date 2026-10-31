use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindowBuilder};

use crate::models::monitor::MonitorInfo;
use crate::services::monitor::list_monitors;

/// Calculates the physical bounding rectangle of the virtual desktop.
fn virtual_desktop_bounds(
    monitors: &[MonitorInfo],
) -> Result<(PhysicalPosition<i32>, PhysicalSize<u32>), String> {
    if monitors.is_empty() {
        return Err("No monitors are available".to_string());
    }

    let mut min_x = i64::MAX;
    let mut min_y = i64::MAX;
    let mut max_x = i64::MIN;
    let mut max_y = i64::MIN;

    for monitor in monitors {
        let left = i64::from(monitor.x);
        let top = i64::from(monitor.y);
        let right = left + i64::from(monitor.width);
        let bottom = top + i64::from(monitor.height);

        min_x = min_x.min(left);
        min_y = min_y.min(top);
        max_x = max_x.max(right);
        max_y = max_y.max(bottom);
    }

    let x = i32::try_from(min_x)
        .map_err(|error| format!("Virtual desktop X coordinate is invalid: {error}"))?;
    let y = i32::try_from(min_y)
        .map_err(|error| format!("Virtual desktop Y coordinate is invalid: {error}"))?;
    let width = u32::try_from(max_x - min_x)
        .map_err(|error| format!("Virtual desktop width is invalid: {error}"))?;
    let height = u32::try_from(max_y - min_y)
        .map_err(|error| format!("Virtual desktop height is invalid: {error}"))?;

    if width == 0 || height == 0 {
        return Err("Virtual desktop dimensions must be greater than zero".to_string());
    }

    Ok((
        PhysicalPosition::new(x, y),
        PhysicalSize::new(width, height),
    ))
}

/// Opens one continuous selection overlay across the entire virtual desktop.
#[tauri::command]
pub async fn open_capture_overlay(app: AppHandle, monitor_id: u32) -> Result<(), String> {
    let _ = monitor_id;
    let monitors = tauri::async_runtime::spawn_blocking(list_monitors)
        .await
        .map_err(|error| format!("Monitor discovery task failed: {error}"))??;

    let (position, size) = virtual_desktop_bounds(&monitors)?;

    let overlay = if let Some(window) = app.get_webview_window("capture-overlay") {
        window
    } else {
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == "capture-overlay")
            .cloned()
            .ok_or_else(|| "capture-overlay window configuration was not found".to_string())?;

        WebviewWindowBuilder::from_config(&app, &config)
            .map_err(|error| format!("Failed to configure overlay window: {error}"))?
            .build()
            .map_err(|error| format!("Failed to create capture overlay: {error}"))?
    };

    overlay
        .set_position(position)
        .map_err(|error| format!("Failed to position overlay: {error}"))?;

    overlay
        .set_size(size)
        .map_err(|error| format!("Failed to resize overlay: {error}"))?;

    overlay
        .show()
        .map_err(|error| format!("Failed to show overlay: {error}"))?;

    overlay
        .set_focus()
        .map_err(|error| format!("Failed to focus overlay: {error}"))?;

    Ok(())
}

/// Closes the selection overlay without closing the main application window.
#[tauri::command]
pub async fn close_capture_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("capture-overlay") {
        overlay
            .close()
            .map_err(|error| format!("Failed to close capture overlay: {error}"))?;
    }

    Ok(())
}
