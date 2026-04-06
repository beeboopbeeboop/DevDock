// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WindowEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;
use std::time::Duration;

mod hotkey;

/// Check if the DevDock server is already running on :3070
async fn is_server_healthy() -> bool {
    match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(client) => {
            match client.get("http://localhost:3070/api/health").send().await {
                Ok(resp) => resp.status().is_success(),
                Err(_) => false,
            }
        }
        Err(_) => false,
    }
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

            // Spawn sidecar in background
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

            // Close-to-hide on main window
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
