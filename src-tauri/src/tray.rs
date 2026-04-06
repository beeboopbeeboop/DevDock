use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};
use tokio::sync::Mutex;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunningProcess {
    pub project_id: String,
    pub running: bool,
    pub pid: Option<u32>,
    pub restart_count: u32,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartupProfile {
    pub id: String,
    pub name: String,
    pub project_ids: Vec<String>,
}

struct TrayState {
    is_online: bool,
    processes: Vec<RunningProcess>,
    profiles: Vec<StartupProfile>,
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Build initial menu
    let quit = MenuItemBuilder::with_id("quit", "Quit DevDock").build(app)?;
    let open = MenuItemBuilder::with_id("open", "Open Dashboard").build(app)?;
    let palette = MenuItemBuilder::with_id("palette", "Command Palette     ⌃⇧D").build(app)?;
    let status = MenuItemBuilder::with_id("status", "● Checking...").enabled(false).build(app)?;
    let sep = PredefinedMenuItem::separator(app)?;

    let menu = MenuBuilder::new(app)
        .item(&status)
        .item(&sep)
        .item(&palette)
        .item(&open)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().unwrap())
        .tooltip("DevDock")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "quit" => {
                    app.exit(0);
                }
                "open" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "palette" => {
                    // Emit event to open Cmd+K palette in the main window
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                        let _ = tauri::Emitter::emit(win.as_ref(), "open-command-palette", ());
                    }
                }
                id if id.starts_with("stop-") => {
                    let project_id = id.strip_prefix("stop-").unwrap_or("").to_string();
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = stop_process(&project_id).await;
                        // Tray will update on next poll
                        let _ = app;
                    });
                }
                id if id.starts_with("profile-start-") => {
                    let profile_id = id.strip_prefix("profile-start-").unwrap_or("").to_string();
                    tauri::async_runtime::spawn(async move {
                        let _ = start_profile(&profile_id).await;
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                if let Some(win) = tray.app_handle().get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    // Start polling in background
    let handle = app.clone();
    let state = Arc::new(Mutex::new(TrayState {
        is_online: false,
        processes: vec![],
        profiles: vec![],
    }));

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let mut interval = Duration::from_secs(3);
        let normal_interval = Duration::from_secs(3);

        loop {
            tokio::time::sleep(interval).await;

            let healthy = check_health(&client).await;
            let mut st = state.lock().await;

            if healthy {
                st.is_online = true;
                interval = normal_interval;

                if let Ok(procs) = fetch_processes(&client).await {
                    st.processes = procs;
                }
                if let Ok(profiles) = fetch_profiles(&client).await {
                    st.profiles = profiles;
                }
            } else {
                st.is_online = false;
                st.processes.clear();
                st.profiles.clear();
                // Backoff: 3 -> 5 -> 10 -> 30
                interval = Duration::from_secs_f64((interval.as_secs_f64() * 1.5).min(30.0));
            }

            // Rebuild tray menu
            if let Err(e) = rebuild_tray_menu(&handle, &st) {
                eprintln!("[DevDock] Failed to rebuild tray menu: {}", e);
            }
        }
    });

    Ok(())
}

fn rebuild_tray_menu(app: &AppHandle, state: &TrayState) -> Result<(), Box<dyn std::error::Error>> {
    let status_text = if state.is_online {
        format!("DevDock  ● Online")
    } else {
        format!("DevDock  ○ Offline")
    };

    let status = MenuItemBuilder::with_id("status", &status_text).enabled(false).build(app)?;
    let sep = PredefinedMenuItem::separator(app)?;

    let mut builder = MenuBuilder::new(app).item(&status).item(&sep);

    // Running servers
    if !state.processes.is_empty() {
        let header = MenuItemBuilder::with_id("header-running", "RUNNING").enabled(false).build(app)?;
        builder = builder.item(&header);

        for proc in &state.processes {
            let label = if proc.restart_count > 0 {
                format!("  {}  ({}x restart)", proc.project_id, proc.restart_count)
            } else {
                format!("  {}", proc.project_id)
            };
            let item = MenuItemBuilder::with_id(
                &format!("stop-{}", proc.project_id),
                &label,
            ).build(app)?;
            builder = builder.item(&item);
        }
        builder = builder.item(&PredefinedMenuItem::separator(app)?);
    }

    // Profiles
    if !state.profiles.is_empty() {
        let header = MenuItemBuilder::with_id("header-profiles", "PROFILES").enabled(false).build(app)?;
        builder = builder.item(&header);

        for profile in &state.profiles {
            let label = format!("  ▶ {}  ({})", profile.name, profile.project_ids.len());
            let item = MenuItemBuilder::with_id(
                &format!("profile-start-{}", profile.id),
                &label,
            ).build(app)?;
            builder = builder.item(&item);
        }
        builder = builder.item(&PredefinedMenuItem::separator(app)?);
    }

    // Actions
    let palette = MenuItemBuilder::with_id("palette", "Command Palette     ⌃⇧D").build(app)?;
    let open = MenuItemBuilder::with_id("open", "Open Dashboard").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit DevDock").build(app)?;

    let menu = builder
        .item(&palette)
        .item(&open)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&quit)
        .build()?;

    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_menu(Some(menu));
    }

    Ok(())
}

async fn check_health(client: &reqwest::Client) -> bool {
    client.get("http://localhost:3070/api/health")
        .send().await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

async fn fetch_processes(client: &reqwest::Client) -> Result<Vec<RunningProcess>, reqwest::Error> {
    client.get("http://localhost:3070/api/actions/running-processes")
        .send().await?
        .json().await
}

async fn fetch_profiles(client: &reqwest::Client) -> Result<Vec<StartupProfile>, reqwest::Error> {
    client.get("http://localhost:3070/api/profiles")
        .send().await?
        .json().await
}

async fn stop_process(project_id: &str) -> Result<(), reqwest::Error> {
    reqwest::Client::new()
        .post(&format!("http://localhost:3070/api/actions/terminal-stop/{}", project_id))
        .send().await?;
    Ok(())
}

async fn start_profile(profile_id: &str) -> Result<(), reqwest::Error> {
    reqwest::Client::new()
        .post(&format!("http://localhost:3070/api/profiles/{}/start", profile_id))
        .header("Content-Type", "application/json")
        .body("{}")
        .send().await?;
    Ok(())
}
