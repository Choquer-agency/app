use tauri::Webview;

/// Inject all bridge scripts into the webview after page load
pub fn inject_all<R: tauri::Runtime>(webview: &Webview<R>) {
    inject_desktop_detection(webview);
    // Badge sync removed in Phase 3 — now handled by NotificationBridge.tsx
    // via real-time Convex subscription + set_badge_count command
}

/// Set window.insightpulse for feature detection in the web app
fn inject_desktop_detection<R: tauri::Runtime>(webview: &Webview<R>) {
    let _ = webview.eval(
        r#"
        (function() {
            if (window.insightpulse) return;
            window.insightpulse = {
                isDesktop: true,
                platform: 'macos'
            };
        })();
        "#,
    );
}
