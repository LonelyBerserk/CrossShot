use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    thread,
    time::Duration,
};

use tauri::{
    Manager, PhysicalPosition, PhysicalSize,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

pub mod commands;
pub mod models;
pub mod services;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Returns the Windows system interval used to recognize a double-click.
fn tray_double_click_interval() -> Duration {
    #[cfg(windows)]
    {
        Duration::from_millis(unsafe {
            windows::Win32::UI::Input::KeyboardAndMouse::GetDoubleClickTime()
        } as u64)
    }

    #[cfg(not(windows))]
    {
        Duration::from_millis(500)
    }
}

/// Displays the custom tray popup next to the tray icon.
fn show_tray_popup(
    app: &tauri::AppHandle,
    rect: tauri::Rect,
    icon_position: PhysicalPosition<f64>,
) -> bool {
    let Some(popup) = app.get_webview_window("tray-menu") else {
        eprintln!("CrossShot: Tray popup window was not found");
        return false;
    };

    let monitor = app
        .monitor_from_point(icon_position.x, icon_position.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());

    let scale_factor = monitor
        .as_ref()
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0);

    let icon_position = rect.position.to_physical::<i32>(scale_factor);
    let icon_size = rect.size.to_physical::<u32>(scale_factor);

    let popup_width = (160.0 * scale_factor).round().max(1.0) as u32;
    let popup_height = (80.0 * scale_factor).round().max(1.0) as u32;
    let gap = (8.0 * scale_factor).round() as i32;
    let margin = (8.0 * scale_factor).round() as i32;

    let raw_x = icon_position.x + icon_size.width as i32 / 2 - popup_width as i32 / 2;

    let icon_center_y = icon_position.y + icon_size.height as i32 / 2;

    let (popup_x, popup_y) =
        if let Some(work_area) = monitor.as_ref().map(|monitor| monitor.work_area()) {
            let area_left = work_area.position.x;
            let area_top = work_area.position.y;
            let area_right = area_left.saturating_add(work_area.size.width as i32);
            let area_bottom = area_top.saturating_add(work_area.size.height as i32);

            let raw_y = if icon_center_y > area_top + work_area.size.height as i32 / 2 {
                icon_position.y - popup_height as i32 - gap
            } else {
                icon_position.y + icon_size.height as i32 + gap
            };

            let min_x = area_left.saturating_add(margin);
            let max_x = area_right
                .saturating_sub(popup_width as i32)
                .saturating_sub(margin)
                .max(min_x);

            let min_y = area_top.saturating_add(margin);
            let max_y = area_bottom
                .saturating_sub(popup_height as i32)
                .saturating_sub(margin)
                .max(min_y);

            (raw_x.clamp(min_x, max_x), raw_y.clamp(min_y, max_y))
        } else {
            (raw_x, icon_position.y - popup_height as i32 - gap)
        };

    if let Err(error) = popup.set_size(PhysicalSize::new(popup_width, popup_height)) {
        eprintln!("CrossShot: Failed to set tray popup size: {error}");
    }

    if let Err(error) = popup.set_position(PhysicalPosition::new(popup_x, popup_y)) {
        eprintln!("CrossShot: Failed to position tray popup: {error}");
    }

    if let Err(error) = popup.show() {
        eprintln!("CrossShot: Failed to show tray popup: {error}");
        return false;
    }

    let _ = popup.set_focus();

    true
}

/// Hides the custom tray popup.
fn hide_tray_popup(app: &tauri::AppHandle) {
    if let Some(popup) = app.get_webview_window("tray-menu") {
        let _ = popup.hide();
    }
}

/// Restores and focuses the main application window.
fn restore_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Shows the main window if hidden, or hides it to the tray if visible.
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let click_generation = Arc::new(AtomicU64::new(0));
    let suppress_next_left_up = Arc::new(AtomicBool::new(false));
    let tray_popup_open = Arc::new(AtomicBool::new(false));
    let tray_left_click_pressed = Arc::new(AtomicBool::new(false));

    let click_generation_for_setup = Arc::clone(&click_generation);
    let suppress_next_left_up_for_setup = Arc::clone(&suppress_next_left_up);
    let tray_popup_open_for_setup = Arc::clone(&tray_popup_open);
    let tray_left_click_pressed_for_setup = Arc::clone(&tray_left_click_pressed);
    tauri::Builder::default()
        .manage(commands::overlay::CaptureSessionState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // Preload the hidden capture WebView before the first screenshot.
            crate::commands::overlay::preload_capture_overlay(app.handle())?;

            let tray_menu_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "tray-menu")
                .cloned()
                .ok_or_else(|| {
                    std::io::Error::other("Tray menu window configuration was not found")
                })?;

            let tray_menu_builder =
                tauri::WebviewWindowBuilder::from_config(app, &tray_menu_config)?;

            #[cfg(windows)]
            let tray_menu_builder = tray_menu_builder.focusable(false);

            #[cfg(windows)]
            let tray_menu = tray_menu_builder.build()?;

            #[cfg(windows)]
            crate::commands::overlay::configure_tray_menu_native_frame(&tray_menu);

            #[cfg(not(windows))]
            tray_menu_builder.build()?;

            let capture_item =
                MenuItem::with_id(app, "capture", "Сделать скриншот", true, None::<&str>)?;
            let record_item =
                MenuItem::with_id(app, "record", "Записать видео", false, None::<&str>)?;
            let settings_item =
                MenuItem::with_id(app, "settings", "Настройки", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &capture_item,
                    &record_item,
                    &separator,
                    &settings_item,
                    &quit_item,
                ],
            )?;

            let icon = app
                .default_window_icon()
                .ok_or_else(|| {
                    std::io::Error::other("The default application icon is not configured")
                })?
                .clone();

            let click_generation_for_tray = Arc::clone(&click_generation_for_setup);
            let suppress_next_left_up_for_tray = Arc::clone(&suppress_next_left_up_for_setup);
            let tray_popup_open_for_tray = Arc::clone(&tray_popup_open_for_setup);
            let tray_left_click_pressed_for_tray = Arc::clone(&tray_left_click_pressed_for_setup);

            let tray_popup_open_for_menu = Arc::clone(&tray_popup_open_for_setup);

            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("CrossShot")
                .on_tray_icon_event(move |tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Down,
                        ..
                    } => {
                        tray_left_click_pressed_for_tray.store(true, Ordering::SeqCst);
                    }

                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        rect,
                        ..
                    } => {
                        tray_left_click_pressed_for_tray.store(false, Ordering::SeqCst);

                        if suppress_next_left_up_for_tray.swap(false, Ordering::SeqCst) {
                            return;
                        }

                        let click_id = click_generation_for_tray.fetch_add(1, Ordering::SeqCst) + 1;

                        let should_open = !tray_popup_open_for_tray.load(Ordering::SeqCst);

                        let app_handle = tray.app_handle().clone();
                        let click_generation = Arc::clone(&click_generation_for_tray);
                        let click_generation_for_main = Arc::clone(&click_generation);
                        let tray_popup_open = Arc::clone(&tray_popup_open_for_tray);
                        let click_interval = tray_double_click_interval();

                        thread::spawn(move || {
                            thread::sleep(click_interval);

                            if click_generation.load(Ordering::SeqCst) != click_id {
                                return;
                            }

                            let app_for_task = app_handle.clone();

                            let _ = app_handle.run_on_main_thread(move || {
                                if click_generation_for_main.load(Ordering::SeqCst) != click_id {
                                    return;
                                }

                                if should_open {
                                    let opened = show_tray_popup(&app_for_task, rect, position);

                                    tray_popup_open.store(opened, Ordering::SeqCst);
                                } else {
                                    hide_tray_popup(&app_for_task);

                                    tray_popup_open.store(false, Ordering::SeqCst);
                                }
                            });
                        });
                    }

                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => {
                        click_generation_for_tray.fetch_add(1, Ordering::SeqCst);

                        suppress_next_left_up_for_tray.store(true, Ordering::SeqCst);

                        tray_left_click_pressed_for_tray.store(false, Ordering::SeqCst);

                        tray_popup_open_for_tray.store(false, Ordering::SeqCst);

                        let app_handle = tray.app_handle().clone();

                        let _ = app_handle.clone().run_on_main_thread(move || {
                            hide_tray_popup(&app_handle);
                            toggle_main_window(&app_handle);
                        });
                    }

                    _ => {}
                })
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "capture" => {
                        tray_popup_open_for_menu.store(false, Ordering::SeqCst);

                        hide_tray_popup(app);

                        if let Some(main_window) = app.get_webview_window("main") {
                            let _ = main_window.hide();
                        }

                        let app_handle = app.clone();

                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = {
                                let capture_state = app_handle
                                    .state::<crate::commands::overlay::CaptureSessionState>(
                                );

                                crate::commands::overlay::open_capture_overlay(
                                    app_handle.clone(),
                                    0,
                                    capture_state,
                                )
                                .await
                            } {
                                eprintln!(
                                    "CrossShot: Failed to open capture overlay from tray: {error}"
                                );
                            }
                        });
                    }

                    "settings" => {
                        tray_popup_open_for_menu.store(false, Ordering::SeqCst);

                        hide_tray_popup(app);
                        restore_main_window(app);
                    }

                    "quit" => app.exit(0),

                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::monitor::get_monitors,
            commands::capture::capture_monitor,
            commands::capture::capture_monitor_region,
            commands::capture::capture_virtual_desktop_region,
            commands::capture::capture_full_virtual_desktop_rgba,
            commands::capture::capture_full_virtual_desktop,
            commands::overlay::open_capture_overlay,
            commands::overlay::close_capture_overlay,
            commands::overlay::mark_capture_overlay_frontend_ready,
            commands::notification::show_capture_notification,
            commands::notification::resize_capture_notification
        ])
        .on_window_event({
            let click_generation = Arc::clone(&click_generation);
            let tray_popup_open = Arc::clone(&tray_popup_open);
            let tray_left_click_pressed = Arc::clone(&tray_left_click_pressed);

            move |window, event| {
                if window.label() == "tray-menu"
                    && let tauri::WindowEvent::Focused(false) = event
                {
                    let tray_menu_window = window.clone();
                    let app_handle = window.app_handle().clone();
                    let tray_popup_open = Arc::clone(&tray_popup_open);
                    let tray_left_click_pressed = Arc::clone(&tray_left_click_pressed);
                    let click_generation = Arc::clone(&click_generation);
                    let generation_at_focus_loss = click_generation.load(Ordering::SeqCst);

                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(200));

                        if click_generation.load(Ordering::SeqCst) != generation_at_focus_loss
                            || tray_left_click_pressed.load(Ordering::SeqCst)
                        {
                            return;
                        }

                        let _ = app_handle.run_on_main_thread(move || {
                            if click_generation.load(Ordering::SeqCst) != generation_at_focus_loss
                                || tray_left_click_pressed.load(Ordering::SeqCst)
                                || tray_menu_window.is_focused().unwrap_or(false)
                            {
                                return;
                            }

                            if tray_popup_open.swap(false, Ordering::SeqCst) {
                                let _ = tray_menu_window.hide();
                            }
                        });
                    });
                }

                if window.label() == "main"
                    && let tauri::WindowEvent::CloseRequested { api, .. } = event
                {
                    api.prevent_close();

                    if let Err(error) = window.hide() {
                        eprintln!("CrossShot: Failed to hide main window to tray: {error}");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
