use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::capture::CaptureResult;
use crate::services::capture::{
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
