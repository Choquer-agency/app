use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Register all global keyboard shortcuts.
///
/// These work system-wide — even when Choquer.Agency is not focused.
/// - Cmd+Shift+I → show/focus app
/// - Cmd+Shift+T → show app + navigate to quick-create
/// - Cmd+Shift+C → show app + toggle clock in/out
/// - Cmd+Shift+N → show app + open notifications
pub fn register_shortcuts(app: &tauri::App) {
    let shortcuts = [
        ("CmdOrCtrl+Shift+KeyI", "show"),
        ("CmdOrCtrl+Shift+KeyT", "quick_ticket"),
        ("CmdOrCtrl+Shift+KeyC", "toggle_clock"),
        ("CmdOrCtrl+Shift+KeyN", "notifications"),
    ];

    for (shortcut_str, action) in shortcuts {
        let shortcut: Shortcut = match shortcut_str.parse() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to parse shortcut {}: {}", shortcut_str, e);
                continue;
            }
        };

        let action = action.to_string();
        let result = app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            handle_shortcut(app, &action);
        });

        if let Err(e) = result {
            // Shortcut may conflict with another app — non-fatal
            eprintln!("Failed to register {}: {}", shortcut_str, e);
        }
    }
}

fn handle_shortcut(app: &tauri::AppHandle, action: &str) {
    let window = match app.get_webview_window("main") {
        Some(w) => w,
        None => return,
    };

    let _ = window.show();
    let _ = window.set_focus();

    match action {
        "show" => {
            // Just show/focus — already done above
        }
        "quick_ticket" => {
            let _ = window.eval(
                "window.dispatchEvent(new CustomEvent('desktop-shortcut', { detail: 'quick_ticket' }))",
            );
        }
        "toggle_clock" => {
            let _ = window.eval(
                "window.dispatchEvent(new CustomEvent('desktop-shortcut', { detail: 'toggle_clock' }))",
            );
        }
        "notifications" => {
            let _ = window.eval(
                "window.dispatchEvent(new CustomEvent('desktop-shortcut', { detail: 'notifications' }))",
            );
        }
        _ => {}
    }
}
