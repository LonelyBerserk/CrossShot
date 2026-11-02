import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Opens the transparent capture overlay on the selected monitor.
 */
export async function openCaptureOverlay(
  monitorId: number,
): Promise<void> {
  const startedAt = performance.now();

  console.info("[PERF][Frontend] openCaptureOverlay started");

  try {
    await invoke<void>("open_capture_overlay", {
      monitorId,
    });

    console.info("[PERF][Frontend] openCaptureOverlay completed", {
      totalMs: Number((performance.now() - startedAt).toFixed(1)),
    });
  } catch (error) {
    console.error("[PERF][Frontend] openCaptureOverlay failed", {
      totalMs: Number((performance.now() - startedAt).toFixed(1)),
      error,
    });

    throw error;
  }
}

/**
 * Closes the capture selection overlay without closing the main window.
 */
export async function closeCaptureOverlay(): Promise<void> {
  await invoke<void>("close_capture_overlay");
}

/**
 * Subscribes to new screenshot capture sessions.
 */
export async function listenForCaptureSessionReady(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen<void>("capture-session-ready", () => {
    handler();
  });
}

/**
 * Notifies Rust that the capture overlay frontend is ready to receive sessions.
 */
export async function markCaptureOverlayFrontendReady(): Promise<void> {
  await invoke<void>("mark_capture_overlay_frontend_ready");
}
