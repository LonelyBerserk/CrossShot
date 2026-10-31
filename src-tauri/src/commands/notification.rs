use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

use crate::models::notification::{
    CAPTURE_NOTIFICATION_EVENT, CaptureNotificationKind, CaptureNotificationPayload,
};

/// Displays a capture notification in the bottom-right corner of the primary monitor.
#[tauri::command]
pub fn show_capture_notification(
    app: AppHandle,
    payload: CaptureNotificationPayload,
) -> Result<(), String> {
    let toast = app
        .get_webview_window("capture-toast")
        .ok_or_else(|| "Capture notification window is not available".to_string())?;

    let is_error = matches!(&payload.kind, CaptureNotificationKind::Error);

    // A disabled success notification must not suppress errors or enabled sounds.
    if !is_error && !payload.show_success_notification && !payload.play_success_sound {
        return Ok(());
    }

    let monitor = app
        .primary_monitor()
        .map_err(|error| format!("Failed to detect primary monitor: {error}"))?
        .ok_or_else(|| "Primary monitor is not available".to_string())?;

    let work_area = monitor.work_area();
    let window_size = toast
        .outer_size()
        .map_err(|error| format!("Failed to read notification window size: {error}"))?;

    let margin = 24_i64;
    let x = i64::from(work_area.position.x) + i64::from(work_area.size.width)
        - i64::from(window_size.width)
        - margin;
    let y = i64::from(work_area.position.y) + i64::from(work_area.size.height)
        - i64::from(window_size.height)
        - margin;

    let position_x =
        i32::try_from(x).map_err(|error| format!("Notification X position is invalid: {error}"))?;
    let position_y =
        i32::try_from(y).map_err(|error| format!("Notification Y position is invalid: {error}"))?;

    toast
        .set_position(PhysicalPosition::new(position_x, position_y))
        .map_err(|error| format!("Failed to position notification: {error}"))?;
    toast
        .set_focusable(false)
        .map_err(|error| format!("Failed to disable notification focus: {error}"))?;
    toast
        .set_always_on_top(true)
        .map_err(|error| format!("Failed to keep notification on top: {error}"))?;

    if is_error || payload.show_success_notification {
        toast
            .show()
            .map_err(|error| format!("Failed to show capture notification: {error}"))?;
    }

    app.emit_to("capture-toast", CAPTURE_NOTIFICATION_EVENT, &payload)
        .map_err(|error| format!("Failed to send capture notification: {error}"))?;

    Ok(())
}
