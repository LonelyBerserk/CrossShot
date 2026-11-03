use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindowBuilder,
};

use crate::models::monitor::MonitorInfo;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

// Stores the raw RGBA frame and frontend readiness for capture sessions.
pub(crate) struct PendingRgbaFrame {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) pixels: Vec<u8>,
}
#[derive(Default)]
pub struct CaptureSessionState {
    pub(crate) pending_rgba: Mutex<Option<PendingRgbaFrame>>,
    pub(crate) frontend_ready: Arc<AtomicBool>,
}

/// Called by the frontend after the capture overlay has subscribed to session events.
#[tauri::command]
pub fn mark_capture_overlay_frontend_ready(state: State<'_, CaptureSessionState>) {
    state.frontend_ready.store(true, Ordering::Release);

    eprintln!("[PERF][Rust] capture overlay frontend is READY: event listener registered");
}
use crate::services::capture::capture_full_virtual_desktop_rgba;
use crate::services::monitor::list_monitors;

#[cfg(windows)]
pub(crate) fn disable_window_accent_blur(window: &tauri::WebviewWindow) {
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
pub(crate) fn configure_tray_menu_native_frame(window: &tauri::WebviewWindow) {
    use std::{ffi::c_void, mem::size_of};

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut c_void,
            attribute: u32,
            value: *const c_void,
            value_size: u32,
        ) -> i32;
    }

    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd.0,
        Err(error) => {
            eprintln!("CrossShot: Failed to obtain tray menu HWND: {error}");
            return;
        }
    };

    if hwnd.is_null() {
        eprintln!("CrossShot: Tray menu HWND is null");
        return;
    }

    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_DONOTROUND: u32 = 1;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_COLOR_NONE: u32 = 0xFFFFFFFE;

    let corner_preference = DWMWCP_DONOTROUND;
    let corner_result = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&corner_preference as *const u32).cast(),
            size_of::<u32>() as u32,
        )
    };

    let border_color = DWMWA_COLOR_NONE;
    let border_result = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            (&border_color as *const u32).cast(),
            size_of::<u32>() as u32,
        )
    };

    if corner_result < 0 {
        eprintln!(
            "CrossShot: Failed to disable native tray menu corner rounding: 0x{:08X}",
            corner_result as u32
        );
    }

    if border_result < 0 {
        eprintln!(
            "CrossShot: Failed to disable native tray menu border: 0x{:08X}",
            border_result as u32
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

/// Creates the capture overlay WebView during application startup.
pub(crate) fn preload_capture_overlay(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if app.get_webview_window("capture-overlay").is_some() {
        eprintln!("[PERF][Rust] capture overlay WebView already exists at startup");
        return Ok(());
    }

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "capture-overlay")
        .cloned()
        .ok_or_else(|| {
            std::io::Error::other("capture-overlay window configuration was not found")
        })?;

    let perf_started_at = std::time::Instant::now();

    let overlay = WebviewWindowBuilder::from_config(app, &config)?
        .focusable(false)
        .build()?;

    eprintln!(
        "[PERF][Rust] capture overlay WebView created during startup: {} ms",
        perf_started_at.elapsed().as_millis()
    );

    // Configure native Windows styles while the window is still hidden.
    #[cfg(windows)]
    {
        if let Err(error) = configure_overlay_for_occlusion(&overlay) {
            eprintln!("CrossShot: Failed to configure preloaded overlay native styles: {error}");
        }

        disable_window_accent_blur(&overlay);
    }

    eprintln!("[PERF][Rust] capture overlay WebView preloading completed");

    Ok(())
}

/// Opens one continuous selection overlay across the entire virtual desktop.
#[tauri::command]
pub async fn open_capture_overlay(
    app: AppHandle,
    monitor_id: u32,
    state: State<'_, CaptureSessionState>,
) -> Result<(), String> {
    let perf_total_started_at = std::time::Instant::now();

    eprintln!("[PERF][Rust] open_capture_overlay started");

    // Capture the desktop before creating or showing the overlay.
    let perf_capture_started_at = std::time::Instant::now();

    let (width, height, pixels) =
        tauri::async_runtime::spawn_blocking(capture_full_virtual_desktop_rgba)
            .await
            .map_err(|error| format!("Screenshot capture task failed: {error}"))??;

    eprintln!(
        "[PERF][Rust] desktop capture + composition + RGBA: {} ms; size={}x{}; bytes={}",
        perf_capture_started_at.elapsed().as_millis(),
        width,
        height,
        pixels.len()
    );

    let _ = monitor_id;

    let perf_monitors_started_at = std::time::Instant::now();

    let monitors = tauri::async_runtime::spawn_blocking(list_monitors)
        .await
        .map_err(|error| format!("Monitor discovery task failed: {error}"))??;

    eprintln!(
        "[PERF][Rust] second monitor enumeration: {} ms; monitors={}",
        perf_monitors_started_at.elapsed().as_millis(),
        monitors.len()
    );

    let (position, size) = virtual_desktop_bounds(&monitors)?;

    let perf_store_started_at = std::time::Instant::now();

    {
        let mut pending_rgba = state
            .pending_rgba
            .lock()
            .map_err(|_| "Capture session storage is unavailable".to_string())?;

        *pending_rgba = Some(PendingRgbaFrame {
            width,
            height,
            pixels,
        });
    }

    eprintln!(
        "[PERF][Rust] storing RGBA frame in session state: {} ms",
        perf_store_started_at.elapsed().as_millis()
    );

    let overlay = if let Some(window) = app.get_webview_window("capture-overlay") {
        eprintln!("[PERF][Rust] overlay window already exists; reusing it");
        window
    } else {
        eprintln!("[PERF][Rust] overlay window does not exist; creating WebView");

        let perf_webview_build_started_at = std::time::Instant::now();
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == "capture-overlay")
            .cloned()
            .ok_or_else(|| "capture-overlay window configuration was not found".to_string())?;

        let window = WebviewWindowBuilder::from_config(&app, &config)
            .map_err(|error| format!("Failed to configure overlay window: {error}"))?
            .focusable(false)
            .build()
            .map_err(|error| format!("Failed to create capture overlay: {error}"))?;

        eprintln!(
            "[PERF][Rust] WebView creation: {} ms",
            perf_webview_build_started_at.elapsed().as_millis()
        );

        window
    };

    let perf_window_setup_started_at = std::time::Instant::now();

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

    eprintln!(
        "[PERF][Rust] window configuration + show: {} ms",
        perf_window_setup_started_at.elapsed().as_millis()
    );

    #[cfg(windows)]
    configure_overlay_for_occlusion(&overlay)?;

    #[cfg(windows)]
    disable_window_accent_blur(&overlay);

    let perf_focus_started_at = std::time::Instant::now();

    overlay
        .set_focus()
        .map_err(|error| format!("Failed to focus overlay: {error}"))?;

    eprintln!(
        "[PERF][Rust] native overlay configuration + focus: {} ms",
        perf_focus_started_at.elapsed().as_millis()
    );

    // Wait for the React event listener during the first lazy WebView creation.
    let frontend_ready = Arc::clone(&state.frontend_ready);
    let perf_ready_wait_started_at = std::time::Instant::now();

    let frontend_ready_confirmed = tauri::async_runtime::spawn_blocking(move || {
        let wait_started_at = std::time::Instant::now();

        while !frontend_ready.load(Ordering::Acquire)
            && wait_started_at.elapsed() < std::time::Duration::from_secs(10)
        {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        frontend_ready.load(Ordering::Acquire)
    })
    .await
    .map_err(|error| format!("Capture overlay readiness task failed: {error}"))?;

    if !frontend_ready_confirmed {
        return Err("Capture overlay frontend did not become ready within 10 seconds".to_string());
    }

    eprintln!(
        "[PERF][Rust] frontend readiness wait: {} ms",
        perf_ready_wait_started_at.elapsed().as_millis()
    );

    app.emit_to("capture-overlay", "capture-session-ready", ())
        .map_err(|error| format!("Failed to notify capture overlay: {error}"))?;

    eprintln!("[PERF][Rust] capture-session-ready event emitted");

    eprintln!(
        "[PERF][Rust] open_capture_overlay total: {} ms",
        perf_total_started_at.elapsed().as_millis()
    );

    Ok(())
}

/// Hides the selection overlay while keeping its WebView alive for reuse.
#[tauri::command]
pub async fn close_capture_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("capture-overlay") {
        overlay
            .hide()
            .map_err(|error| format!("Failed to hide capture overlay: {error}"))?;
    }

    Ok(())
}
