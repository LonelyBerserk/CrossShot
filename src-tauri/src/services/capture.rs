use std::borrow::Cow;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use xcap::{
    Monitor,
    image::{Rgba, RgbaImage, imageops},
};

use crate::models::capture::{CaptureResult, RegionCaptureResult};

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

/// Captures a physical-pixel rectangle across all intersecting monitors.
///
/// Areas not covered by a monitor are filled with opaque black pixels.
pub fn capture_virtual_desktop_region(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<RgbaImage, String> {
    if width == 0 || height == 0 {
        return Err("Capture region width and height must be greater than zero".to_string());
    }

    let pixel_count = u64::from(width) * u64::from(height);

    if pixel_count > 100_000_000 {
        return Err("Capture region is too large".to_string());
    }

    let selection_left = i64::from(x);
    let selection_top = i64::from(y);
    let selection_right = selection_left + i64::from(width);
    let selection_bottom = selection_top + i64::from(height);

    let monitors =
        Monitor::all().map_err(|error| format!("Failed to enumerate monitors: {error}"))?;

    let mut output = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 255]));
    let mut captured_any = false;

    for monitor in monitors {
        let monitor_x = monitor
            .x()
            .map_err(|error| format!("Failed to read monitor X coordinate: {error}"))?;
        let monitor_y = monitor
            .y()
            .map_err(|error| format!("Failed to read monitor Y coordinate: {error}"))?;
        let monitor_width = monitor
            .width()
            .map_err(|error| format!("Failed to read monitor width: {error}"))?;
        let monitor_height = monitor
            .height()
            .map_err(|error| format!("Failed to read monitor height: {error}"))?;

        let monitor_left = i64::from(monitor_x);
        let monitor_top = i64::from(monitor_y);
        let monitor_right = monitor_left + i64::from(monitor_width);
        let monitor_bottom = monitor_top + i64::from(monitor_height);

        let intersection_left = selection_left.max(monitor_left);
        let intersection_top = selection_top.max(monitor_top);
        let intersection_right = selection_right.min(monitor_right);
        let intersection_bottom = selection_bottom.min(monitor_bottom);

        if intersection_left >= intersection_right || intersection_top >= intersection_bottom {
            continue;
        }

        let source_x = u32::try_from(intersection_left - monitor_left)
            .map_err(|error| format!("Invalid monitor source X coordinate: {error}"))?;
        let source_y = u32::try_from(intersection_top - monitor_top)
            .map_err(|error| format!("Invalid monitor source Y coordinate: {error}"))?;
        let part_width = u32::try_from(intersection_right - intersection_left)
            .map_err(|error| format!("Invalid capture width: {error}"))?;
        let part_height = u32::try_from(intersection_bottom - intersection_top)
            .map_err(|error| format!("Invalid capture height: {error}"))?;

        let part = monitor
            .capture_region(source_x, source_y, part_width, part_height)
            .map_err(|error| format!("Failed to capture monitor region: {error}"))?;

        let destination_x = intersection_left - selection_left;
        let destination_y = intersection_top - selection_top;

        imageops::replace(&mut output, &part, destination_x, destination_y);

        captured_any = true;
    }

    if !captured_any {
        return Err("Capture region does not intersect any monitor".to_string());
    }

    Ok(output)
}

/// Captures, saves and copies a virtual desktop region to the clipboard.
///
/// A clipboard failure does not invalidate the saved screenshot.
pub fn capture_and_copy_virtual_desktop_region(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    output_dir: &Path,
) -> Result<RegionCaptureResult, String> {
    let image = capture_virtual_desktop_region(x, y, width, height)?;

    std::fs::create_dir_all(output_dir)
        .map_err(|error| format!("Failed to create screenshot directory: {error}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before UNIX epoch: {error}"))?
        .as_nanos();

    let output_path = output_dir.join(format!("crossshot_region_{timestamp}.png"));

    image
        .save(&output_path)
        .map_err(|error| format!("Failed to save screenshot: {error}"))?;

    let clipboard_result = arboard::Clipboard::new().and_then(|mut clipboard| {
        clipboard.set_image(arboard::ImageData {
            width: image.width() as usize,
            height: image.height() as usize,
            bytes: Cow::Borrowed(image.as_raw()),
        })
    });

    let (clipboard_copied, clipboard_error) = match clipboard_result {
        Ok(()) => (true, None),
        Err(error) => (false, Some(error.to_string())),
    };

    Ok(RegionCaptureResult {
        file_path: output_path.to_string_lossy().into_owned(),
        width: image.width(),
        height: image.height(),
        clipboard_copied,
        clipboard_error,
    })
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
