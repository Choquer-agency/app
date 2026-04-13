use tauri::menu::{
    Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{App, AppHandle, Manager, Wry};

/// Build the complete macOS menu bar
pub fn build_menu(app: &App) -> tauri::Result<Menu<Wry>> {
    // -- Choquer.Agency menu --
    let app_submenu = SubmenuBuilder::new(app, "Choquer.Agency")
        .item(&MenuItemBuilder::with_id("about", "About Choquer.Agency").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("preferences", "Preferences...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("check_updates", "Check for Updates...")
                .build(app)?,
        )
        .separator()
        .items(&[
            &PredefinedMenuItem::hide(app, Some("Hide Choquer.Agency"))?,
            &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
            &PredefinedMenuItem::show_all(app, Some("Show All"))?,
        ])
        .separator()
        .quit()
        .build()?;

    // -- File menu --
    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("close_window", "Close Window")
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .build()?;

    // -- Edit menu --
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .items(&[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
        ])
        .separator()
        .items(&[
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ])
        .build()?;

    // -- View menu (navigation shortcuts) --
    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("nav_home", "Home")
                .accelerator("CmdOrCtrl+1")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("nav_crm", "CRM")
                .accelerator("CmdOrCtrl+2")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("nav_tickets", "Tickets")
                .accelerator("CmdOrCtrl+3")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("nav_reports", "Reports")
                .accelerator("CmdOrCtrl+4")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("nav_timesheet", "Timesheet")
                .accelerator("CmdOrCtrl+5")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("nav_settings", "Settings")
                .accelerator("CmdOrCtrl+6")
                .build(app)?,
        )
        .build()?;

    // -- Window menu --
    let window_submenu = SubmenuBuilder::new(app, "Window")
        .items(&[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
        ])
        .separator()
        .item(
            &MenuItemBuilder::with_id("bring_to_center", "Bring Window to Center")
                .accelerator("CmdOrCtrl+Shift+C")
                .build(app)?,
        )
        .build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .build()
}

/// Handle menu item clicks
pub fn handle_menu_event(app_handle: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        // Navigation
        "nav_home" => navigate(app_handle, "/admin"),
        "nav_crm" => navigate(app_handle, "/admin/crm"),
        "nav_tickets" => navigate(app_handle, "/admin/tickets"),
        "nav_reports" => navigate(app_handle, "/admin/reports"),
        "nav_timesheet" => navigate(app_handle, "/admin/timesheet"),
        "nav_settings" => navigate(app_handle, "/admin/settings"),
        "preferences" => navigate(app_handle, "/admin/settings"),

        // Window actions
        "reload" => {
            if let Some(w) = app_handle.get_webview_window("main") {
                let _ = w.eval("window.location.reload()");
            }
        }
        "close_window" => {
            if let Some(w) = app_handle.get_webview_window("main") {
                let _ = w.hide();
            }
        }
        "bring_to_center" => crate::show_main_window_safely(app_handle),

        // Check for updates
        "check_updates" => {
            let handle = app_handle.clone();
            std::thread::spawn(move || {
                crate::updater::check_and_install(&handle);
            });
        }

        // About dialog
        "about" => {
            if let Some(w) = app_handle.get_webview_window("main") {
                let version = app_handle.package_info().version.to_string();
                let _ = w.eval(&format!(
                    "alert('Choquer.Agency Desktop v{}\\n\\nChoquer Agency\\'s internal portal.\\nPowered by Tauri v2.')",
                    version
                ));
            }
        }

        _ => {}
    }
}

/// Navigate the webview to a path
fn navigate(app_handle: &AppHandle, path: &str) {
    if let Some(w) = app_handle.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.eval(&format!("window.location.href = '{}'", path));
    }
}
