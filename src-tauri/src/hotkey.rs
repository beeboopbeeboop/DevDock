use core_graphics::event::{CGEvent, CGEventTap, CGEventTapLocation, CGEventTapPlacement, CGEventTapOptions, CGEventType, EventField};
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use tauri::{AppHandle, Emitter, Manager};

/// Global hotkey: Ctrl+Shift+D opens command palette in the main window.
/// Uses CGEventTap — requires Accessibility permission.
pub fn setup_hotkey(app_handle: AppHandle) {
    // Read hotkey config from ~/.devdock/config.json
    let (target_keycode, need_ctrl, need_shift, need_cmd, need_alt) = read_hotkey_config();

    std::thread::Builder::new()
        .name("devdock-hotkey".into())
        .spawn(move || {
            let handle = app_handle.clone();

            let tap = CGEventTap::new(
                CGEventTapLocation::HID,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                vec![CGEventType::KeyDown],
                move |_proxy, _event_type, event: &CGEvent| -> Option<CGEvent> {
                    let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                    let flags = event.get_flags();

                    let ctrl_ok = !need_ctrl || flags.contains(core_graphics::event::CGEventFlags::CGEventFlagControl);
                    let shift_ok = !need_shift || flags.contains(core_graphics::event::CGEventFlags::CGEventFlagShift);
                    let cmd_ok = !need_cmd || flags.contains(core_graphics::event::CGEventFlags::CGEventFlagCommand);
                    let alt_ok = !need_alt || flags.contains(core_graphics::event::CGEventFlags::CGEventFlagAlternate);

                    // Prevent triggering on extra modifiers
                    let no_extra_cmd = need_cmd || !flags.contains(core_graphics::event::CGEventFlags::CGEventFlagCommand);
                    let no_extra_ctrl = need_ctrl || !flags.contains(core_graphics::event::CGEventFlags::CGEventFlagControl);

                    if keycode == target_keycode
                        && ctrl_ok && shift_ok && cmd_ok && alt_ok
                        && no_extra_cmd && no_extra_ctrl
                    {
                        let h = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            // Show window, focus it, and emit palette event
                            if let Some(win) = h.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                                let _ = win.emit("open-command-palette", ());
                            }
                        });
                        return None; // swallow
                    }

                    Some(event.clone())
                },
            );

            let trusted: bool = unsafe {
                extern "C" { fn AXIsProcessTrusted() -> bool; }
                AXIsProcessTrusted()
            };
            eprintln!("[DevDock] Accessibility trusted: {}", trusted);

            match tap {
                Ok(tap) => unsafe {
                    let loop_source = tap.mach_port.create_runloop_source(0)
                        .expect("Failed to create runloop source");
                    let run_loop = CFRunLoop::get_current();
                    run_loop.add_source(&loop_source, kCFRunLoopCommonModes);
                    tap.enable();
                    eprintln!("[DevDock] Global hotkey active (Tauri)");
                    CFRunLoop::run_current();
                },
                Err(e) => {
                    eprintln!("[DevDock] CGEventTap FAILED: {:?}", e);
                    eprintln!("[DevDock] Grant Accessibility permission for the DevDock binary");
                }
            }
        })
        .expect("Failed to spawn hotkey thread");
}

/// Read hotkey config from ~/.devdock/config.json
fn read_hotkey_config() -> (i64, bool, bool, bool, bool) {
    let config_path = dirs::home_dir()
        .map(|h| h.join(".devdock/config.json"));

    if let Some(path) = config_path {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(hotkey) = json.get("hotkey") {
                    let key = hotkey.get("key").and_then(|k| k.as_str()).unwrap_or("D");
                    let mods = hotkey.get("modifiers").and_then(|m| m.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
                        .unwrap_or_else(|| vec!["ctrl".into(), "shift".into()]);

                    let keycode = key_to_code(key);
                    let ctrl = mods.iter().any(|m| m == "ctrl" || m == "control");
                    let shift = mods.iter().any(|m| m == "shift");
                    let cmd = mods.iter().any(|m| m == "cmd" || m == "command");
                    let alt = mods.iter().any(|m| m == "alt" || m == "option");

                    eprintln!("[DevDock] Hotkey config: key={} ctrl={} shift={} cmd={} alt={}", key, ctrl, shift, cmd, alt);
                    return (keycode, ctrl, shift, cmd, alt);
                }
            }
        }
    }

    // Default: Ctrl+Shift+D
    eprintln!("[DevDock] Using default hotkey: Ctrl+Shift+D");
    (2, true, true, false, false)
}

fn key_to_code(key: &str) -> i64 {
    match key.to_uppercase().as_str() {
        "A" => 0, "S" => 1, "D" => 2, "F" => 3, "H" => 4, "G" => 5, "Z" => 6, "X" => 7,
        "C" => 8, "V" => 9, "B" => 11, "Q" => 12, "W" => 13, "E" => 14, "R" => 15,
        "Y" => 16, "T" => 17, "1" => 18, "2" => 19, "3" => 20, "4" => 21, "6" => 22,
        "5" => 23, "9" => 25, "7" => 26, "8" => 28, "0" => 29,
        "O" => 31, "U" => 32, "I" => 34, "P" => 35,
        "L" => 37, "J" => 38, "K" => 40,
        "N" => 45, "M" => 46,
        "SPACE" => 49,
        _ => 2, // default to D
    }
}
