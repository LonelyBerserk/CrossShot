use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

use crate::models::notification::{
    CAPTURE_NOTIFICATION_EVENT, CaptureNotificationKind, CaptureNotificationPayload,
};

#[cfg(windows)]
fn set_notification_window_bounds(
    toast: &tauri::WebviewWindow,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> Result<(), String> {
    use std::ffi::c_void;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn SetWindowPos(
            hwnd: *mut c_void,
            hwnd_insert_after: *mut c_void,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }

    let hwnd = toast
        .hwnd()
        .map_err(|error| format!("Failed to obtain notification HWND: {error}"))?
        .0;
    if hwnd.is_null() {
        return Err("Notification HWND is null".to_string());
    }

    let width = i32::try_from(size.width)
        .map_err(|error| format!("Notification width is invalid: {error}"))?;
    let height = i32::try_from(size.height)
        .map_err(|error| format!("Notification height is invalid: {error}"))?;

    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;

    let result = unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            position.x,
            position.y,
            width,
            height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        )
    };

    if result == 0 {
        return Err("SetWindowPos failed while updating notification geometry".to_string());
    }

    Ok(())
}

#[cfg(not(windows))]
fn set_notification_window_bounds(
    toast: &tauri::WebviewWindow,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> Result<(), String> {
    toast
        .set_size(size)
        .map_err(|error| format!("Failed to resize notification window: {error}"))?;
    toast
        .set_position(position)
        .map_err(|error| format!("Failed to position notification: {error}"))?;
    Ok(())
}

/// Resizes and anchors the notification window to the bottom-right corner.
fn configure_capture_toast_window(
    app: &AppHandle,
    toast: &tauri::WebviewWindow,
    _expanded: bool,
) -> Result<(), String> {
    let monitor = app
        .primary_monitor()
        .map_err(|error| format!("Failed to detect primary monitor: {error}"))?
        .ok_or_else(|| "Primary monitor is not available".to_string())?;

    let scale_factor = monitor.scale_factor();
    let (logical_width, logical_height) = (366.0, 112.0);

    let width = (logical_width * scale_factor).round() as u32;
    let height = (logical_height * scale_factor).round() as u32;
    let margin = (36.0 * scale_factor).round() as i64;
    let work_area = monitor.work_area();

    let x = i64::from(work_area.position.x) + i64::from(work_area.size.width)
        - i64::from(width)
        - margin;

    let y = i64::from(work_area.position.y) + i64::from(work_area.size.height)
        - i64::from(height)
        - margin;

    let position_x =
        i32::try_from(x).map_err(|error| format!("Notification X position is invalid: {error}"))?;
    let position_y =
        i32::try_from(y).map_err(|error| format!("Notification Y position is invalid: {error}"))?;

    set_notification_window_bounds(
        toast,
        PhysicalPosition::new(position_x, position_y),
        PhysicalSize::new(width, height),
    )?;

    Ok(())
}

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

    configure_capture_toast_window(&app, &toast, false)?;

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

/// Changes the native notification window size when its card expands or collapses.
#[tauri::command]
pub fn resize_capture_notification(app: AppHandle, expanded: bool) -> Result<(), String> {
    let toast = app
        .get_webview_window("capture-toast")
        .ok_or_else(|| "Capture notification window is not available".to_string())?;

    configure_capture_toast_window(&app, &toast, expanded)
}
