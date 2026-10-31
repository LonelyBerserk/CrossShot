import { invoke } from "@tauri-apps/api/core";

/**
 * Opens the transparent capture overlay on the selected monitor.
 */
export async function openCaptureOverlay(
  monitorId: number,
): Promise<void> {
  await invoke<void>("open_capture_overlay", {
    monitorId,
  });
}

/**
 * Closes the capture selection overlay without closing the main window.
 */
export async function closeCaptureOverlay(): Promise<void> {
  await invoke<void>("close_capture_overlay");
}
