use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::capture::{CaptureResult, RegionCaptureResult};
use crate::services::capture::{
    capture_and_copy_full_virtual_desktop, capture_and_copy_virtual_desktop_region,
    capture_monitor as capture_monitor_service,
    capture_monitor_region as capture_monitor_region_service,
};

/// Captures a monitor and saves the PNG in the user's Pictures/CrossShot folder.
#[tauri::command]
pub async fn capture_monitor(app: AppHandle, monitor_id: u32) -> Result<CaptureResult, String> {
    let output_dir: PathBuf = app
        .path()
        .picture_dir()
        .map_err(|error| format!("Failed to resolve Pictures directory: {error}"))?
        .join("CrossShot");

    tauri::async_runtime::spawn_blocking(move || capture_monitor_service(monitor_id, &output_dir))
        .await
        .map_err(|error| format!("Screenshot capture task failed: {error}"))?
}

/// Captures a rectangular region of a selected monitor.
#[tauri::command]
pub async fn capture_monitor_region(
    app: AppHandle,
    monitor_id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<CaptureResult, String> {
    let output_dir: PathBuf = app
        .path()
        .picture_dir()
        .map_err(|error| format!("Failed to resolve Pictures directory: {error}"))?
        .join("CrossShot");

    tauri::async_runtime::spawn_blocking(move || {
        capture_monitor_region_service(monitor_id, x, y, width, height, &output_dir)
    })
    .await
    .map_err(|error| format!("Screenshot capture task failed: {error}"))?
}

/// Captures a region across multiple monitors, saves it and copies it to clipboard.
#[tauri::command]
pub async fn capture_virtual_desktop_region(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<RegionCaptureResult, String> {
    let output_dir: PathBuf = app
        .path()
        .picture_dir()
        .map_err(|error| format!("Failed to resolve Pictures directory: {error}"))?
        .join("CrossShot");

    let overlay = app
        .get_webview_window("capture-overlay")
        .ok_or_else(|| "Capture overlay window is not available".to_string())?;

    overlay
        .hide()
        .map_err(|error| format!("Failed to hide capture overlay: {error}"))?;

    let capture_result = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        capture_and_copy_virtual_desktop_region(x, y, width, height, &output_dir)
    })
    .await
    .map_err(|error| format!("Screenshot capture task failed: {error}"))?;

    match capture_result {
        Ok(result) => Ok(result),
        Err(error) => {
            if let Err(restore_error) = overlay.show().and_then(|_| overlay.set_focus()) {
                return Err(format!(
                    "{error}; additionally failed to restore capture overlay: {restore_error}"
                ));
            }
            Err(error)
        }
    }
}

/// Transfers the pending RGBA frame through one binary IPC response.
/// The final 8 bytes contain width and height as little-endian u32 values.
#[tauri::command]
pub fn capture_full_virtual_desktop_rgba(
    state: tauri::State<'_, crate::commands::overlay::CaptureSessionState>,
) -> Result<tauri::ipc::Response, String> {
    let frame = state
        .pending_rgba
        .lock()
        .map_err(|_| "Capture session storage is unavailable".to_string())?
        .take()
        .ok_or_else(|| "No screenshot is waiting for this capture session".to_string())?;

    let expected_length = u64::from(frame.width)
        .checked_mul(u64::from(frame.height))
        .and_then(|pixels| pixels.checked_mul(4))
        .and_then(|bytes| usize::try_from(bytes).ok())
        .ok_or_else(|| "RGBA frame dimensions are invalid".to_string())?;

    if frame.pixels.len() != expected_length {
        return Err(format!(
            "RGBA frame size mismatch: expected {expected_length} bytes, received {}",
            frame.pixels.len()
        ));
    }

    let width_bytes = frame.width.to_le_bytes();
    let height_bytes = frame.height.to_le_bytes();
    let pixel_byte_length = frame.pixels.len();
    let mut payload = frame.pixels;
    payload.extend_from_slice(&width_bytes);
    payload.extend_from_slice(&height_bytes);

    eprintln!(
        "[PERF][Rust] RGBA IPC command prepared; pixel_bytes={}; payload_bytes={}",
        pixel_byte_length,
        payload.len()
    );

    Ok(tauri::ipc::Response::new(payload))
}

/// Captures the complete virtual desktop without opening the selection overlay.
#[tauri::command]
pub async fn capture_full_virtual_desktop(app: AppHandle) -> Result<RegionCaptureResult, String> {
    let output_dir: PathBuf = app
        .path()
        .picture_dir()
        .map_err(|error| format!("Failed to resolve Pictures directory: {error}"))?
        .join("CrossShot");

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main application window is not available".to_string())?;

    main_window
        .hide()
        .map_err(|error| format!("Failed to hide main window: {error}"))?;

    let capture_result = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        capture_and_copy_full_virtual_desktop(&output_dir)
    })
    .await
    .map_err(|error| format!("Screenshot capture task failed: {error}"))
    .and_then(|result| result);

    if let Err(error) = main_window.show().and_then(|_| main_window.set_focus()) {
        eprintln!("CrossShot: Failed to restore main window after capture: {error}");
    }

    capture_result
}
