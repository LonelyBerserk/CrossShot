import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import type { CaptureNotificationPayload } from "../types/notification";

export async function displayCaptureNotification(
  payload: CaptureNotificationPayload,
): Promise<void> {
  await invoke<void>("show_capture_notification", { payload });
}

export async function listenForCaptureNotifications(
  handler: (payload: CaptureNotificationPayload) => void,
): Promise<UnlistenFn> {
  return listen<CaptureNotificationPayload>("capture-notification", (event) => {
    handler(event.payload);
  });
}

export async function revealScreenshotInFolder(filePath: string): Promise<void> {
  await revealItemInDir(filePath);
}