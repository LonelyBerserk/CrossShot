import { invoke } from "@tauri-apps/api/core";

import type {
  CaptureRegion,
  CaptureResult,
  RegionCaptureResult,
} from "../types/capture";

/** Captures the entire selected monitor as a PNG file. */
export async function captureMonitor(
  monitorId: number,
): Promise<CaptureResult> {
  return invoke<CaptureResult>("capture_monitor", {
    monitorId,
  });
}

/** Captures a rectangular region of the selected monitor. */
export async function captureMonitorRegion(
  region: CaptureRegion,
): Promise<CaptureResult> {
  const { monitorId, x, y, width, height } = region;

  return invoke<CaptureResult>("capture_monitor_region", {
    monitorId,
    x,
    y,
    width,
    height,
  });
}

/**
 * Captures a region across the entire virtual desktop.
 * Saves the result as PNG and copies the image to the system clipboard.
 */
export async function captureVirtualDesktopRegion(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<RegionCaptureResult> {
  return invoke<RegionCaptureResult>("capture_virtual_desktop_region", {
    x,
    y,
    width,
    height,
  });
}