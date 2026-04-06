use core_graphics::event::{CGEvent, CGEventTap, CGEventTapLocation, CGEventTapPlacement, CGEventTapOptions, CGEventType, EventField};
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use tauri::{AppHandle, Emitter, Manager};

/// Toggle the pre-created palette window.
fn toggle_palette(handle: &AppHandle) {
    if let Some(win) = handle.get_webview_window("palette") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.emit("palette-shown", ());
            let _ = win.show();
            let _ = win.set_focus();
            // Center on screen each time
            if let Ok(Some(monitor)) = win.current_monitor() {
                let screen = monitor.size();
                let scale = monitor.scale_factor();
                let x = (screen.width as f64 / scale - 640.0) / 2.0;
                let y = (screen.height as f64 / scale - 420.0) / 2.0 - 80.0;
                let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
            }
        }
    }
}

/// Global hotkey: Ctrl+Shift+D toggles command palette.
pub fn setup_hotkey(app_handle: AppHandle) {
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

                    let has_ctrl = flags.contains(core_graphics::event::CGEventFlags::CGEventFlagControl);
                    let has_shift = flags.contains(core_graphics::event::CGEventFlags::CGEventFlagShift);

                    if keycode == 2 && has_ctrl && has_shift {
                        let h = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            toggle_palette(&h);
                        });
                        return None;
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
                    eprintln!("[DevDock] Global hotkey (Ctrl+Shift+D) active");
                    CFRunLoop::run_current();
                },
                Err(e) => {
                    eprintln!("[DevDock] CGEventTap FAILED: {:?}", e);
                }
            }
        })
        .expect("Failed to spawn hotkey thread");
}
