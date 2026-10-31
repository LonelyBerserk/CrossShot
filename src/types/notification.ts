export type CaptureNotificationKind = "success" | "error";

export interface CaptureNotificationPayload {
  kind: CaptureNotificationKind;
  filePath?: string;
  errorCode?: string;
  playSuccessSound: boolean;
  showSuccessNotification: boolean;
}