use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::capture::{CaptureResult, RegionCaptureResult};
use crate::services::capture::{
    capture_and_copy_virtual_desktop_region, capture_monitor as capture_monitor_service,
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
