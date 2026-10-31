use serde::Serialize;

/// Metadata about a physical display available to CrossShot.
///
/// Coordinates use the virtual desktop coordinate space.
/// Width and height are pixel dimensions reported by XCap.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub friendly_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}
