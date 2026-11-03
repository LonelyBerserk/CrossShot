use std::borrow::Cow;
use std::io::Cursor;
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use xcap::{
    Monitor,
    image::{
        ExtendedColorType, ImageEncoder, RgbaImage,
        codecs::png::{CompressionType, FilterType, PngEncoder},
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

    #[derive(Clone, Copy)]
    struct MonitorCaptureTask {
        monitor_id: u32,
        center_x: i32,
        center_y: i32,
        source_x: u32,
        source_y: u32,
        width: u32,
        height: u32,
        destination_x: u32,
        destination_y: u32,
    }

    struct CapturedMonitorPart {
        monitor_id: u32,
        destination_x: u32,
        destination_y: u32,
        image: RgbaImage,
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

    let mut capture_tasks = Vec::with_capacity(monitors.len());

    for monitor in monitors {
        let perf_monitor_metadata_started_at = Instant::now();

        let monitor_id = monitor
            .id()
            .map_err(|error| format!("Failed to read monitor ID: {error}"))?;

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
            "[PERF][Rust][Service] monitor metadata: {:.1} ms; id={}; size={}x{}",
            perf_monitor_metadata_started_at.elapsed().as_secs_f64() * 1000.0,
            monitor_id,
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

        let destination_x = u32::try_from(intersection_left - selection_left)
            .map_err(|error| format!("Invalid destination X coordinate: {error}"))?;

        let destination_y = u32::try_from(intersection_top - selection_top)
            .map_err(|error| format!("Invalid destination Y coordinate: {error}"))?;

        let center_x = i32::try_from(monitor_left + i64::from(monitor_width / 2))
            .map_err(|error| format!("Invalid monitor center X coordinate: {error}"))?;

        let center_y = i32::try_from(monitor_top + i64::from(monitor_height / 2))
            .map_err(|error| format!("Invalid monitor center Y coordinate: {error}"))?;

        capture_tasks.push(MonitorCaptureTask {
            monitor_id,
            center_x,
            center_y,
            source_x,
            source_y,
            width: part_width,
            height: part_height,
            destination_x,
            destination_y,
        });
    }

    if capture_tasks.is_empty() {
        return Err("Capture region does not intersect any monitor".to_string());
    }

    eprintln!(
        "[PERF][Rust][Service] parallel capture tasks prepared; monitors={}",
        capture_tasks.len()
    );

    // Each worker creates its own Monitor object.
    // Only simple coordinates and dimensions are transferred between threads.
    // The final RGBA buffer is allocated while monitor captures are running.
    let (mut output, captured_parts) = std::thread::scope(|scope| {
        let handles: Vec<_> = capture_tasks
            .into_iter()
            .map(|task| {
                scope.spawn(move || -> Result<CapturedMonitorPart, String> {
                    let perf_worker_started_at = Instant::now();

                    let monitor = Monitor::from_point(task.center_x, task.center_y)
                        .map_err(|error| {
                            format!(
                                "Failed to resolve monitor {} from point ({}, {}): {}",
                                task.monitor_id,
                                task.center_x,
                                task.center_y,
                                error
                            )
                        })?;

                    let actual_monitor_id = monitor
                        .id()
                        .map_err(|error| format!("Failed to read worker monitor ID: {error}"))?;

                    if actual_monitor_id != task.monitor_id {
                        return Err(format!(
                            "Monitor mismatch: expected {}, resolved {}",
                            task.monitor_id,
                            actual_monitor_id
                        ));
                    }

                    let perf_capture_started_at = Instant::now();

                    let image = monitor
                        .capture_region(
                            task.source_x,
                            task.source_y,
                            task.width,
                            task.height,
                        )
                        .map_err(|error| {
                            format!(
                                "Failed to capture monitor {}: {}",
                                task.monitor_id,
                                error
                            )
                        })?;

                    let capture_elapsed_ms =
                        perf_capture_started_at.elapsed().as_secs_f64() * 1000.0;

                    if image.width() != task.width || image.height() != task.height {
                        return Err(format!(
                            "Unexpected capture dimensions for monitor {}: expected {}x{}, got {}x{}",
                            task.monitor_id,
                            task.width,
                            task.height,
                            image.width(),
                            image.height()
                        ));
                    }

                    eprintln!(
                        "[PERF][Rust][Service] parallel monitor capture: {:.1} ms; worker={:.1} ms; id={}; size={}x{}",
                        capture_elapsed_ms,
                        perf_worker_started_at.elapsed().as_secs_f64() * 1000.0,
                        task.monitor_id,
                        image.width(),
                        image.height()
                    );

                    Ok(CapturedMonitorPart {
                        monitor_id: task.monitor_id,
                        destination_x: task.destination_x,
                        destination_y: task.destination_y,
                        image,
                    })
                })
            })
            .collect();

        // Allocate and initialize the destination while workers capture monitors.
        let perf_output_allocation_started_at = Instant::now();

        let pixel_count = usize::try_from(pixel_count)
            .map_err(|error| format!("Invalid output pixel count: {error}"))?;
        let pixels = [0u8, 0, 0, 255].repeat(pixel_count);
        let output = RgbaImage::from_raw(width, height, pixels)
            .ok_or_else(|| "Failed to initialize output RGBA image".to_string())?;

        eprintln!(
            "[PERF][Rust][Service] output image allocation: {:.1} ms; size={}x{}",
            perf_output_allocation_started_at.elapsed().as_secs_f64() * 1000.0,
            width,
            height
        );

        let mut captured_parts = Vec::with_capacity(handles.len());
        let mut first_capture_error: Option<String> = None;

        // Join every worker, even if one of them failed.
        for handle in handles {
            match handle.join() {
                Ok(Ok(part)) => captured_parts.push(part),
                Ok(Err(error)) => {
                    if first_capture_error.is_none() {
                        first_capture_error = Some(error);
                    }
                }
                Err(_) => {
                    if first_capture_error.is_none() {
                        first_capture_error = Some("Monitor capture worker panicked".to_string());
                    }
                }
            }
        }

        if let Some(error) = first_capture_error {
            return Err(error);
        }

        Ok((output, captured_parts))
    })?;

    // Compose the completed monitor images on the current thread.
    // This avoids concurrent writes into the shared destination buffer.
    for captured_part in captured_parts {
        let part = captured_part.image;
        let part_width = part.width();
        let part_height = part.height();

        let destination_x = usize::try_from(captured_part.destination_x)
            .map_err(|error| format!("Invalid destination X coordinate: {error}"))?;

        let destination_y = usize::try_from(captured_part.destination_y)
            .map_err(|error| format!("Invalid destination Y coordinate: {error}"))?;

        let perf_compose_started_at = Instant::now();

        let source_row_bytes = usize::try_from(part_width)
            .map_err(|error| format!("Invalid source row width: {error}"))?
            .checked_mul(4)
            .ok_or_else(|| "Source row byte count overflow".to_string())?;

        let destination_stride = usize::try_from(width)
            .map_err(|error| format!("Invalid destination width: {error}"))?
            .checked_mul(4)
            .ok_or_else(|| "Destination row byte count overflow".to_string())?;

        let destination_x_bytes = destination_x
            .checked_mul(4)
            .ok_or_else(|| "Destination X byte offset overflow".to_string())?;

        let row_count = usize::try_from(part_height)
            .map_err(|error| format!("Invalid source row count: {error}"))?;

        let source_data = part.as_raw();
        let destination_data: &mut [u8] = output.as_mut();

        for row in 0..row_count {
            let source_start = row
                .checked_mul(source_row_bytes)
                .ok_or_else(|| "Source pixel offset overflow".to_string())?;

            let source_end = source_start
                .checked_add(source_row_bytes)
                .ok_or_else(|| "Source pixel range overflow".to_string())?;

            let destination_row = destination_y
                .checked_add(row)
                .ok_or_else(|| "Destination row overflow".to_string())?;

            let destination_start = destination_row
                .checked_mul(destination_stride)
                .and_then(|offset| offset.checked_add(destination_x_bytes))
                .ok_or_else(|| "Destination pixel offset overflow".to_string())?;

            let destination_end = destination_start
                .checked_add(source_row_bytes)
                .ok_or_else(|| "Destination pixel range overflow".to_string())?;

            let source_slice = source_data
                .get(source_start..source_end)
                .ok_or_else(|| "Source pixel range is out of bounds".to_string())?;

            let destination_slice = destination_data
                .get_mut(destination_start..destination_end)
                .ok_or_else(|| "Destination pixel range is out of bounds".to_string())?;

            destination_slice.copy_from_slice(source_slice);
        }

        eprintln!(
            "[PERF][Rust][Service] RGBA row composition: {:.1} ms; monitor_id={}; rows={}; bytes={}",
            perf_compose_started_at.elapsed().as_secs_f64() * 1000.0,
            captured_part.monitor_id,
            row_count,
            source_row_bytes * row_count
        );
    }

    eprintln!(
        "[PERF][Rust][Service] capture_virtual_desktop_region total: {:.1} ms",
        perf_region_total_started_at.elapsed().as_secs_f64() * 1000.0
    );

    Ok(output)
}

/// Captures the entire virtual desktop and composes it as an RGBA image in memory.
fn capture_full_virtual_desktop_image() -> Result<RgbaImage, String> {
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

    eprintln!(
        "[PERF][Rust][Service] full desktop image acquisition total: {:.1} ms",
        perf_full_capture_started_at.elapsed().as_secs_f64() * 1000.0
    );

    Ok(image)
}

/// Encodes the complete virtual desktop as PNG bytes.
pub fn capture_full_virtual_desktop_png() -> Result<Vec<u8>, String> {
    let image = capture_full_virtual_desktop_image()?;
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

    Ok(png_bytes)
}

/// Captures the entire virtual desktop as raw RGBA pixels for preview.
pub fn capture_full_virtual_desktop_rgba() -> Result<(u32, u32, Vec<u8>), String> {
    let perf_rgba_started_at = Instant::now();
    let image = capture_full_virtual_desktop_image()?;
    let width = image.width();
    let height = image.height();
    let pixels = image.into_raw();

    eprintln!(
        "[PERF][Rust][Service] RGBA frame prepared: {:.1} ms; size={}x{}; bytes={}",
        perf_rgba_started_at.elapsed().as_secs_f64() * 1000.0,
        width,
        height,
        pixels.len()
    );

    Ok((width, height, pixels))
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
