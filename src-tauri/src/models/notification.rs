use serde::{Deserialize, Serialize};

/// Type of capture notification.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureNotificationKind {
    Success,
    Error,
}

/// Payload sent from Rust to the capture-toast window.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureNotificationPayload {
    pub kind: CaptureNotificationKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    pub play_success_sound: bool,
    pub show_success_notification: bool,
}

/// Tauri event used to deliver capture notifications.
pub const CAPTURE_NOTIFICATION_EVENT: &str = "capture-notification";
