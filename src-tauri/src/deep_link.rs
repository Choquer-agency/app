use tauri::{App, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

/// Register the deep link handler
pub fn setup_deep_links(app: &App) -> tauri::Result<()> {
    let app_handle = app.handle().clone();

    app.deep_link().on_open_url(move |event| {
        for url_str in event.urls() {
            handle_deep_link(&app_handle, url_str.as_str());
        }
    });

    Ok(())
}

/// Parse a deep link URL and navigate the webview
fn handle_deep_link(app: &tauri::AppHandle, raw_url: &str) {
    if let Ok(parsed) = url::Url::parse(raw_url) {
        let path = parsed.path();
        let query = parsed
            .query()
            .map(|q| format!("?{}", q))
            .unwrap_or_default();
        let full_path = format!("{}{}", path, query);

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.eval(&format!("window.location.href = '{}'", full_path));
        }
    }
}
