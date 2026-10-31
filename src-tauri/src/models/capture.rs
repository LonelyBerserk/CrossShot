use serde::Serialize;

/// Information about a successfully captured screenshot.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub file_path: String,
    pub monitor_id: u32,
    pub width: u32,
    pub height: u32,
}
