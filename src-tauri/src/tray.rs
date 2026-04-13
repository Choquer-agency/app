use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

/// Set up the system tray icon and context menu
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("tray_show", "Show Choquer.Agency").build(app)?;

    // Quick actions
    let quick_ticket =
        MenuItemBuilder::with_id("tray_quick_ticket", "Quick Create Ticket...").build(app)?;
    let toggle_clock =
        MenuItemBuilder::with_id("tray_toggle_clock", "Clock In / Out").build(app)?;

    // Navigation
    let home = MenuItemBuilder::with_id("tray_home", "Home").build(app)?;
    let crm = MenuItemBuilder::with_id("tray_crm", "CRM").build(app)?;
    let tickets = MenuItemBuilder::with_id("tray_tickets", "Tickets").build(app)?;
    let reports = MenuItemBuilder::with_id("tray_reports", "Reports").build(app)?;
    let timesheet = MenuItemBuilder::with_id("tray_timesheet", "Timesheet").build(app)?;
    let quit = MenuItemBuilder::with_id("tray_quit", "Quit Choquer.Agency").build(app)?;

    let tray_menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&quick_ticket)
        .item(&toggle_clock)
        .separator()
        .item(&home)
        .item(&crm)
        .item(&tickets)
        .item(&reports)
        .item(&timesheet)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .icon_as_template(true)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                show_and_focus(app);
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_show" => show_and_focus(app),
            "tray_quick_ticket" => show_and_dispatch(app, "quick_ticket"),
            "tray_toggle_clock" => show_and_dispatch(app, "toggle_clock"),
            "tray_home" => show_and_navigate(app, "/admin"),
            "tray_crm" => show_and_navigate(app, "/admin/crm"),
            "tray_tickets" => show_and_navigate(app, "/admin/tickets"),
            "tray_reports" => show_and_navigate(app, "/admin/reports"),
            "tray_timesheet" => show_and_navigate(app, "/admin/timesheet"),
            "tray_quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn show_and_focus(app: &AppHandle) {
    crate::show_main_window_safely(app);
}

fn show_and_navigate(app: &AppHandle, path: &str) {
    crate::show_main_window_safely(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&format!("window.location.href = '{}'", path));
    }
}

/// Show the app and dispatch a custom event for the frontend to handle
fn show_and_dispatch(app: &AppHandle, action: &str) {
    crate::show_main_window_safely(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&format!(
            "window.dispatchEvent(new CustomEvent('desktop-shortcut', {{ detail: '{}' }}))",
            action
        ));
    }
}
