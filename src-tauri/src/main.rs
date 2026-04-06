// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WindowEvent};
use tauri::menu::{MenuBuilder, SubmenuBuilder, PredefinedMenuItem};
use tauri_plugin_shell::ShellExt;
use std::time::Duration;

mod hotkey;
mod tray;

/// Check if the DevDock server is already running on :3070
async fn is_server_healthy() -> bool {
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(2)).build() {
        Ok(c) => c,
        Err(_) => return false,
    };
    client.get("http://localhost:3070/api/health").send().await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Wait for the server to become healthy, with retries
async fn wait_for_server(max_attempts: u32) -> bool {
    for i in 0..max_attempts {
        if is_server_healthy().await {
            println!("[DevDock] Server healthy after {} attempt(s)", i + 1);
            return true;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // ── Native App Menu (Phase 4) ──
            // Edit menu is critical — without it, Cmd+C/V don't work in webview text inputs
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let devdock_menu = SubmenuBuilder::new(app, "DevDock")
                .about(None)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .separator()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&devdock_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;

            // Hide from Dock — menu bar only app
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // System tray + global hotkey handled by Swift menu bar app

            // ── Sidecar ──
            tauri::async_runtime::spawn(async move {
                if is_server_healthy().await {
                    println!("[DevDock] Server already running on :3070, skipping sidecar spawn");
                } else {
                    println!("[DevDock] Starting sidecar...");
                    match app_handle.shell().sidecar("devdock-server") {
                        Ok(cmd) => {
                            match cmd.spawn() {
                                Ok((_rx, _child)) => println!("[DevDock] Sidecar spawned"),
                                Err(e) => eprintln!("[DevDock] Failed to spawn sidecar: {}", e),
                            }
                        }
                        Err(e) => eprintln!("[DevDock] Failed to create sidecar command: {}", e),
                    }
                }

                // Wait for server, then show main window
                if wait_for_server(20).await {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                } else {
                    eprintln!("[DevDock] Server did not become healthy after 10s");
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                    }
                }
            });

            // ── Close-to-hide ──
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DevDock");
}
