use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const PIP_LABEL: &str = "timer-pip";
const PIP_WIDTH: f64 = 300.0;
const PIP_HEIGHT: f64 = 40.0;
const PIP_MARGIN: f64 = 20.0;

/// Show the PiP timer window (create on first call, re-show on subsequent calls)
#[tauri::command]
pub fn show_timer_pip(app: AppHandle) {
    // Already exists — just show it
    if let Some(win) = app.get_webview_window(PIP_LABEL) {
        let _ = win.show();
        return;
    }

    // Determine base URL
    let url = if cfg!(debug_assertions) {
        "http://localhost:3388/timer-pip"
    } else {
        "https://choquer.app/timer-pip"
    };

    // Calculate bottom-right position from primary monitor
    let (x, y) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let logical_w = size.width as f64 / scale;
            let logical_h = size.height as f64 / scale;
            (
                logical_w - PIP_WIDTH - PIP_MARGIN,
                logical_h - PIP_HEIGHT - PIP_MARGIN - 80.0,
            )
        })
        .unwrap_or((1200.0, 800.0));

    let builder = WebviewWindowBuilder::new(
        &app,
        PIP_LABEL,
        WebviewUrl::External(url.parse().unwrap()),
    )
    .title("Timer")
    .inner_size(PIP_WIDTH, PIP_HEIGHT)
    .position(x, y)
    .always_on_top(true)
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .skip_taskbar(true)
    .visible(true)
    .focused(false)
    .visible_on_all_workspaces(true);

    if let Err(e) = builder.build() {
        eprintln!("Failed to create PiP window: {e}");
    }
}

/// Hide the PiP timer window (keeps it alive for fast re-show)
#[tauri::command]
pub fn hide_timer_pip(app: AppHandle) {
    if let Some(win) = app.get_webview_window(PIP_LABEL) {
        let _ = win.hide();
    }
}

/// Move the PiP window to bottom-right of the monitor the cursor is on.
/// Only moves if the PiP is currently on a different monitor.
#[tauri::command]
pub fn pip_follow_cursor(app: AppHandle) {
    let win = match app.get_webview_window(PIP_LABEL) {
        Some(w) => w,
        None => return,
    };

    // All positions are physical pixels
    let cursor = match app.cursor_position() {
        Ok(c) => c,
        Err(_) => return,
    };

    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(_) => return,
    };

    // Find which monitor the cursor is on
    let cursor_monitor = monitors.iter().find(|m| {
        let pos = m.position();
        let size = m.size();
        let px = pos.x as f64;
        let py = pos.y as f64;
        let pw = size.width as f64;
        let ph = size.height as f64;
        cursor.x >= px && cursor.x < px + pw && cursor.y >= py && cursor.y < py + ph
    });

    let monitor = match cursor_monitor {
        Some(m) => m,
        None => return,
    };

    // Check if PiP is already on this monitor — if so, don't move (respect user drag)
    if let Ok(current) = win.outer_position() {
        let pos = monitor.position();
        let size = monitor.size();
        let cx = current.x as f64;
        let cy = current.y as f64;
        let px = pos.x as f64;
        let py = pos.y as f64;
        let pw = size.width as f64;
        let ph = size.height as f64;
        if cx >= px && cx < px + pw && cy >= py && cy < py + ph {
            return;
        }
    }

    // Move to bottom-right of the cursor's monitor (logical coordinates)
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let size = monitor.size();
    let lx = pos.x as f64 / scale;
    let ly = pos.y as f64 / scale;
    let lw = size.width as f64 / scale;
    let lh = size.height as f64 / scale;

    let target_x = lx + lw - PIP_WIDTH - PIP_MARGIN;
    let target_y = ly + lh - PIP_HEIGHT - PIP_MARGIN - 80.0;

    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition {
        x: target_x,
        y: target_y,
    }));
}

/// Show the main window and navigate to a path (called from PiP to open a ticket)
#[tauri::command]
pub fn show_main_and_navigate(app: AppHandle, path: String) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.eval(&format!("window.location.href = '{}'", path));
    }
}
