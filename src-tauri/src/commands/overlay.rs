use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindowBuilder};

use crate::models::monitor::MonitorInfo;
use crate::services::monitor::list_monitors;

#[cfg(windows)]
fn disable_window_accent_blur(window: &tauri::WebviewWindow) {
    use std::{ffi::c_void, mem::size_of};

    #[repr(C)]
    struct DwmMargins {
        cx_left_width: i32,
        cx_right_width: i32,
        cy_top_height: i32,
        cy_bottom_height: i32,
    }

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut c_void,
            attribute: u32,
            value: *const c_void,
            value_size: u32,
        ) -> i32;

        fn DwmExtendFrameIntoClientArea(hwnd: *mut c_void, margins: *const DwmMargins) -> i32;
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetWindowLongPtrW(hwnd: *mut c_void, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: *mut c_void, index: i32, new_long: isize) -> isize;
    }

    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd.0,
        Err(error) => {
            eprintln!("CrossShot: Failed to obtain overlay HWND: {error}");
            return;
        }
    };

    if hwnd.is_null() {
        eprintln!("CrossShot: Overlay HWND is null");
        return;
    }

    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_TRANSPARENT: isize = 0x00000020;

    const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
    const DWMSBT_NONE: u32 = 1;

    // Temporarily exclude this window from Windhawk effects.
    let original_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };

    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, original_style | WS_EX_TRANSPARENT);
    }

    // Disable the system backdrop without changing Tauri transparency.
    let backdrop_type = DWMSBT_NONE;

    let backdrop_result = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            (&backdrop_type as *const u32).cast(),
            size_of::<u32>() as u32,
        )
    };

    // Restore the normal DWM frame.
    let margins = DwmMargins {
        cx_left_width: 0,
        cx_right_width: 0,
        cy_top_height: 0,
        cy_bottom_height: 0,
    };

    let frame_result = unsafe { DwmExtendFrameIntoClientArea(hwnd, &margins) };

    // Restore the original window style.
    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, original_style);
    }

    if backdrop_result < 0 {
        eprintln!(
            "CrossShot: Failed to disable system backdrop: 0x{:08X}",
            backdrop_result as u32
        );
    }

    if frame_result < 0 {
        eprintln!(
            "CrossShot: Failed to restore DWM frame: 0x{:08X}",
            frame_result as u32
        );
    }
}

#[cfg(windows)]
fn configure_overlay_for_occlusion(window: &tauri::WebviewWindow) -> Result<(), String> {
    use std::ffi::c_void;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetWindowLongPtrW(hwnd: *mut c_void, index: i32) -> isize;

        fn SetWindowLongPtrW(hwnd: *mut c_void, index: i32, new_long: isize) -> isize;

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

    const GWL_EXSTYLE: i32 = -20;

    const WS_EX_TOOLWINDOW: u32 = 0x00000080;
    const WS_EX_APPWINDOW: u32 = 0x00040000;

    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;

    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Failed to obtain overlay HWND: {error}"))?
        .0;

    let current_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };

    let updated_style = ((current_style as u32 | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW) as isize;

    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, updated_style);
    }

    let applied = unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
    };

    if applied == 0 {
        return Err("Failed to apply overlay window styles".to_string());
    }

    let actual_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 };

    if actual_style & WS_EX_TOOLWINDOW == 0 || actual_style & WS_EX_APPWINDOW != 0 {
        return Err("Overlay window styles were not applied correctly".to_string());
    }

    Ok(())
}

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
            .focusable(false)
            .build()
            .map_err(|error| format!("Failed to create capture overlay: {error}"))?
    };

    overlay
        .set_focusable(true)
        .map_err(|error| format!("Failed to restore overlay focusability: {error}"))?;

    overlay
        .set_position(position)
        .map_err(|error| format!("Failed to position overlay: {error}"))?;

    overlay
        .set_size(size)
        .map_err(|error| format!("Failed to resize overlay: {error}"))?;

    overlay
        .show()
        .map_err(|error| format!("Failed to show overlay: {error}"))?;

    #[cfg(windows)]
    configure_overlay_for_occlusion(&overlay)?;

    #[cfg(windows)]
    disable_window_accent_blur(&overlay);

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
