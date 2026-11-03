import { invoke } from "@tauri-apps/api/core";

import type {
  CapturedImage,
  CapturedRgbaFrame,
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
/**
 * Captures the complete virtual desktop as one PNG file.
 * Preserves monitor arrangement and copies the image to the clipboard.
 */
export async function captureFullVirtualDesktop(): Promise<RegionCaptureResult> {
  return invoke<RegionCaptureResult>("capture_full_virtual_desktop");
}
/**
 * Captures the complete virtual desktop and creates a temporary browser URL.
 *
 * The caller is responsible for releasing the URL with URL.revokeObjectURL()
 * when the editing session is finished.
 */
export async function captureFullVirtualDesktopImage(): Promise<CapturedImage> {
  const totalStartedAt = performance.now();
  const ipcStartedAt = performance.now();

  const pngBytes = await invoke<ArrayBuffer>(
    "capture_full_virtual_desktop_png",
  );

  const ipcFinishedAt = performance.now();

  if (!(pngBytes instanceof ArrayBuffer) || pngBytes.byteLength === 0) {
    throw new Error("The screenshot command returned empty or invalid PNG data.");
  }

  const blobStartedAt = performance.now();

  const imageBlob = new Blob([pngBytes], {
    type: "image/png",
  });

  const url = URL.createObjectURL(imageBlob);
  const blobFinishedAt = performance.now();

  try {
    const image = new Image();
    image.src = url;

    const decodeStartedAt = performance.now();
    await image.decode();
    const decodeFinishedAt = performance.now();

    console.info("[PERF][Frontend] screenshot image pipeline", {
      ipcMs: Number((ipcFinishedAt - ipcStartedAt).toFixed(1)),
      blobMs: Number((blobFinishedAt - blobStartedAt).toFixed(1)),
      decodeMs: Number((decodeFinishedAt - decodeStartedAt).toFixed(1)),
      totalMs: Number((decodeFinishedAt - totalStartedAt).toFixed(1)),
      bytes: pngBytes.byteLength,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });

    return {
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } catch (error) {
    URL.revokeObjectURL(url);

    const details = error instanceof Error ? error.message : String(error);

    throw new Error(`Failed to decode captured screenshot: ${details}`, { cause: error });
  }
}

/**
 * Retrieves a screenshot frame as raw RGBA pixels without PNG encoding.
 * The final 8 bytes of the binary response contain width and height.
 */
export async function captureFullVirtualDesktopRgba(): Promise<CapturedRgbaFrame> {
  const totalStartedAt = performance.now();
  const ipcStartedAt = performance.now();

  const rgbaBytes = await invoke<ArrayBuffer>(
    "capture_full_virtual_desktop_rgba",
  );
  const ipcFinishedAt = performance.now();

  if (!(rgbaBytes instanceof ArrayBuffer)) {
    throw new Error("The screenshot command returned invalid RGBA data.");
  }

  if (rgbaBytes.byteLength < 8) {
    throw new Error("The screenshot command returned an incomplete RGBA response.");
  }

  const headerStartedAt = performance.now();
  const headerOffset = rgbaBytes.byteLength - 8;
  const header = new DataView(rgbaBytes, headerOffset, 8);
  const width = header.getUint32(0, true);
  const height = header.getUint32(4, true);
  const headerFinishedAt = performance.now();

  if (width <= 0 || height <= 0) {
    throw new Error("The screenshot command returned invalid frame dimensions.");
  }

  const expectedByteLength = width * height * 4;
  if (
    !Number.isSafeInteger(expectedByteLength) ||
    headerOffset !== expectedByteLength
  ) {
    throw new Error(
      `RGBA frame size mismatch: expected ${expectedByteLength} bytes, received ${headerOffset}.`,
    );
  }

  const imageDataStartedAt = performance.now();
  const pixelBytes = new Uint8ClampedArray(rgbaBytes, 0, headerOffset);
  const imageData = new ImageData(pixelBytes, width, height);
  const imageDataFinishedAt = performance.now();

  console.info("[PERF][Frontend] RGBA image pipeline", {
    ipcMs: Number((ipcFinishedAt - ipcStartedAt).toFixed(1)),
    headerMs: Number((headerFinishedAt - headerStartedAt).toFixed(1)),
    imageDataMs: Number((imageDataFinishedAt - imageDataStartedAt).toFixed(1)),
    totalMs: Number((imageDataFinishedAt - totalStartedAt).toFixed(1)),
    bytes: headerOffset,
    payloadBytes: rgbaBytes.byteLength,
    width,
    height,
  });

  return {
    imageData,
    width,
    height,
  };
}
