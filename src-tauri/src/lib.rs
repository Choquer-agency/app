mod bridge;
mod deep_link;
mod dock;
mod menu;
mod notifications;
mod tray;
mod updater;

use tauri::Manager;

#[tauri::command]
fn update_dock_badge(count: u32) {
    dock::set_dock_badge(count);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Navigation guard (carried over from Phase 1)
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("navigation-guard")
                .on_navigation(|_webview, url| {
                    let allowed_domains = [
                        "choquer.app",
                        "convex.cloud",
                        "convex.site",
                        "vercel-storage.com",
                        "localhost",
                    ];

                    let is_allowed = allowed_domains.iter().any(|domain| {
                        url.host_str().map_or(false, |h| {
                            h == *domain || h.ends_with(&format!(".{}", domain))
                        })
                    });

                    if is_allowed {
                        true
                    } else {
                        let _ = open::that(url.as_str());
                        false
                    }
                })
                .build(),
        )
        // Tauri commands callable from JavaScript
        .invoke_handler(tauri::generate_handler![
            update_dock_badge,
            notifications::show_notification,
            updater::check_for_update,
            updater::install_update,
        ])
        // Inject JS bridge on every page load (desktop detection)
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                bridge::inject_all(webview);
            }
        })
        // App setup
        .setup(|app| {
            // 1. Build and set the native menu bar
            let app_menu = menu::build_menu(app)?;
            app.set_menu(app_menu)?;

            // 2. Set up system tray
            tray::setup_tray(app.handle())?;

            // 3. Set up deep link handler
            deep_link::setup_deep_links(app)?;

            // 4. Schedule automatic update check (5s delay, non-blocking)
            updater::schedule_startup_check(app);

            // 4. Configure main window — hide-on-close behavior
            let main_window = app
                .get_webview_window("main")
                .expect("main window not found");

            let window_for_close = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            Ok(())
        })
        // Menu event handler
        .on_menu_event(menu::handle_menu_event)
        .run(tauri::generate_context!())
        .expect("error while running Choquer.Agency");
}
