use std::borrow::Cow;
use std::io::Cursor;
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use xcap::{
    Monitor,
    image::{
        ExtendedColorType, ImageEncoder, Rgba, RgbaImage,
        codecs::png::{CompressionType, FilterType, PngEncoder},
        imageops,
    },
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
    let perf_region_total_started_at = Instant::now();

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

    let perf_monitor_enum_started_at = Instant::now();

    let monitors =
        Monitor::all().map_err(|error| format!("Failed to enumerate monitors: {error}"))?;

    eprintln!(
        "[PERF][Rust][Service] region Monitor::all: {:.1} ms; monitors={}",
        perf_monitor_enum_started_at.elapsed().as_secs_f64() * 1000.0,
        monitors.len()
    );

    let perf_output_allocation_started_at = Instant::now();

    let mut output = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 255]));

    eprintln!(
        "[PERF][Rust][Service] output image allocation: {:.1} ms; size={}x{}",
        perf_output_allocation_started_at.elapsed().as_secs_f64() * 1000.0,
        width,
        height
    );
    let mut captured_any = false;

    for monitor in monitors {
        let perf_monitor_metadata_started_at = Instant::now();

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

        eprintln!(
            "[PERF][Rust][Service] monitor metadata: {:.1} ms; size={}x{}",
            perf_monitor_metadata_started_at.elapsed().as_secs_f64() * 1000.0,
            monitor_width,
            monitor_height
        );

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

        let perf_monitor_capture_started_at = Instant::now();

        let part = monitor
            .capture_region(source_x, source_y, part_width, part_height)
            .map_err(|error| format!("Failed to capture monitor region: {error}"))?;

        eprintln!(
            "[PERF][Rust][Service] monitor.capture_region: {:.1} ms; region={}x{}",
            perf_monitor_capture_started_at.elapsed().as_secs_f64() * 1000.0,
            part_width,
            part_height
        );

        let destination_x = intersection_left - selection_left;
        let destination_y = intersection_top - selection_top;

        let perf_compose_started_at = Instant::now();

        imageops::replace(&mut output, &part, destination_x, destination_y);

        eprintln!(
            "[PERF][Rust][Service] imageops::replace: {:.1} ms",
            perf_compose_started_at.elapsed().as_secs_f64() * 1000.0
        );

        captured_any = true;
    }

    if !captured_any {
        return Err("Capture region does not intersect any monitor".to_string());
    }

    eprintln!(
        "[PERF][Rust][Service] capture_virtual_desktop_region total: {:.1} ms",
        perf_region_total_started_at.elapsed().as_secs_f64() * 1000.0
    );

    Ok(output)
}

/// Captures the entire virtual desktop and encodes it as PNG bytes in memory.
pub fn capture_full_virtual_desktop_png() -> Result<Vec<u8>, String> {
    let perf_full_capture_started_at = Instant::now();
    let perf_full_monitor_enum_started_at = Instant::now();

    let monitors =
        Monitor::all().map_err(|error| format!("Failed to enumerate monitors: {error}"))?;

    eprintln!(
        "[PERF][Rust][Service] full capture Monitor::all: {:.1} ms; monitors={}",
        perf_full_monitor_enum_started_at.elapsed().as_secs_f64() * 1000.0,
        monitors.len()
    );

    if monitors.is_empty() {
        return Err("No monitors are available".to_string());
    }

    let mut min_x = i64::MAX;
    let mut min_y = i64::MAX;
    let mut max_x = i64::MIN;
    let mut max_y = i64::MIN;

    for monitor in &monitors {
        let x = monitor
            .x()
            .map_err(|error| format!("Failed to read monitor X coordinate: {error}"))?;
        let y = monitor
            .y()
            .map_err(|error| format!("Failed to read monitor Y coordinate: {error}"))?;
        let width = monitor
            .width()
            .map_err(|error| format!("Failed to read monitor width: {error}"))?;
        let height = monitor
            .height()
            .map_err(|error| format!("Failed to read monitor height: {error}"))?;

        let left = i64::from(x);
        let top = i64::from(y);
        let right = left + i64::from(width);
        let bottom = top + i64::from(height);

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

    let perf_composition_started_at = Instant::now();

    // A single monitor already produces the complete virtual desktop image.
    // Avoid allocating another full-size buffer and copying pixels into it.
    let image = if monitors.len() == 1 {
        let perf_direct_capture_started_at = Instant::now();

        let image = monitors[0]
            .capture_image()
            .map_err(|error| format!("Failed to capture monitor: {error}"))?;

        eprintln!(
            "[PERF][Rust][Service] single-monitor capture_image: {:.1} ms; size={}x{}",
            perf_direct_capture_started_at.elapsed().as_secs_f64() * 1000.0,
            image.width(),
            image.height()
        );

        image
    } else {
        eprintln!(
            "[PERF][Rust][Service] multi-monitor composition selected; monitors={}",
            monitors.len()
        );

        capture_virtual_desktop_region(x, y, width, height)?
    };

    eprintln!(
        "[PERF][Rust][Service] full desktop image acquisition: {:.1} ms",
        perf_composition_started_at.elapsed().as_secs_f64() * 1000.0
    );

    let mut cursor = Cursor::new(Vec::new());
    let perf_png_started_at = Instant::now();

    PngEncoder::new_with_quality(&mut cursor, CompressionType::Fast, FilterType::NoFilter)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|error| format!("Failed to encode screenshot as PNG: {error}"))?;

    let png_bytes = cursor.into_inner();

    eprintln!(
        "[PERF][Rust][Service] PNG encoding: {:.1} ms; bytes={}",
        perf_png_started_at.elapsed().as_secs_f64() * 1000.0,
        png_bytes.len()
    );

    eprintln!(
        "[PERF][Rust][Service] capture_full_virtual_desktop_png total: {:.1} ms",
        perf_full_capture_started_at.elapsed().as_secs_f64() * 1000.0
    );

    Ok(png_bytes)
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

/// Captures the complete virtual desktop, preserving every monitor's position.
pub fn capture_and_copy_full_virtual_desktop(
    output_dir: &Path,
) -> Result<RegionCaptureResult, String> {
    let monitors =
        Monitor::all().map_err(|error| format!("Failed to enumerate monitors: {error}"))?;

    if monitors.is_empty() {
        return Err("No monitors are available".to_string());
    }

    let mut min_x = i64::MAX;
    let mut min_y = i64::MAX;
    let mut max_x = i64::MIN;
    let mut max_y = i64::MIN;

    for monitor in &monitors {
        let x = monitor
            .x()
            .map_err(|error| format!("Failed to read monitor X coordinate: {error}"))?;
        let y = monitor
            .y()
            .map_err(|error| format!("Failed to read monitor Y coordinate: {error}"))?;
        let width = monitor
            .width()
            .map_err(|error| format!("Failed to read monitor width: {error}"))?;
        let height = monitor
            .height()
            .map_err(|error| format!("Failed to read monitor height: {error}"))?;

        let left = i64::from(x);
        let top = i64::from(y);
        let right = left + i64::from(width);
        let bottom = top + i64::from(height);

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

    capture_and_copy_virtual_desktop_region(x, y, width, height, output_dir)
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
