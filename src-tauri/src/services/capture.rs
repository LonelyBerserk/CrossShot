use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use xcap::{Monitor, image::RgbaImage};

use crate::models::capture::CaptureResult;

/// Finds a monitor by its XCap ID.
fn find_monitor(monitor_id: u32) -> Result<Monitor, String> {
    let monitors =
        Monitor::all().map_err(|error| format!("Failed to enumerate monitors: {error}"))?;

    monitors
        .into_iter()
        .find(|candidate| candidate.id().ok() == Some(monitor_id))
        .ok_or_else(|| format!("Monitor with ID {monitor_id} was not found"))
}

/// Captures the entire requested monitor and saves it as a PNG file.
pub fn capture_monitor(monitor_id: u32, output_dir: &Path) -> Result<CaptureResult, String> {
    let monitor = find_monitor(monitor_id)?;

    let image = monitor
        .capture_image()
        .map_err(|error| format!("Failed to capture monitor {monitor_id}: {error}"))?;

    save_image(image, monitor_id, output_dir)
}

/// Captures a rectangular region relative to the selected monitor top-left corner.
/// Coordinates are monitor-local pixel coordinates.
pub fn capture_monitor_region(
    monitor_id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    output_dir: &Path,
) -> Result<CaptureResult, String> {
    if width == 0 || height == 0 {
        return Err("Capture region width and height must be greater than zero".to_string());
    }

    let monitor = find_monitor(monitor_id)?;

    let monitor_width = monitor
        .width()
        .map_err(|error| format!("Failed to read monitor width: {error}"))?;
    let monitor_height = monitor
        .height()
        .map_err(|error| format!("Failed to read monitor height: {error}"))?;

    let right = x
        .checked_add(width)
        .ok_or_else(|| "Capture region right boundary overflowed".to_string())?;
    let bottom = y
        .checked_add(height)
        .ok_or_else(|| "Capture region bottom boundary overflowed".to_string())?;

    if right > monitor_width || bottom > monitor_height {
        return Err(format!(
            "Capture region ({x}, {y}, {width}, {height}) exceeds monitor bounds ({} x {})",
            monitor_width, monitor_height
        ));
    }

    let image = monitor
        .capture_region(x, y, width, height)
        .map_err(|error| format!("Failed to capture region on monitor {monitor_id}: {error}"))?;

    save_image(image, monitor_id, output_dir)
}

/// Saves a captured image and returns its metadata.
fn save_image(
    image: RgbaImage,
    monitor_id: u32,
    output_dir: &Path,
) -> Result<CaptureResult, String> {
    std::fs::create_dir_all(output_dir)
        .map_err(|error| format!("Failed to create screenshot directory: {error}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before UNIX epoch: {error}"))?
        .as_nanos();

    let output_path = output_dir.join(format!("crossshot_{timestamp}_{monitor_id}.png"));

    image
        .save(&output_path)
        .map_err(|error| format!("Failed to save screenshot: {error}"))?;

    Ok(CaptureResult {
        file_path: output_path.to_string_lossy().into_owned(),
        monitor_id,
        width: image.width(),
        height: image.height(),
    })
}
