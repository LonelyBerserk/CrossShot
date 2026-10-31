use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

pub mod commands;
pub mod models;
pub mod services;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::monitor::get_monitors,
            commands::capture::capture_monitor,
            commands::capture::capture_monitor_region,
            commands::capture::capture_virtual_desktop_region,
            commands::overlay::open_capture_overlay,
            commands::overlay::close_capture_overlay,
            commands::notification::show_capture_notification
        ])
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                let app = window.app_handle();

                for label in ["capture-overlay", "capture-toast"] {
                    if let Some(child) = app.get_webview_window(label)
                        && let Err(error) = child.destroy()
                    {
                        eprintln!("CrossShot: Failed to destroy {label} window: {error}");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
