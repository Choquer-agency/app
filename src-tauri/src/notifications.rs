use tauri_plugin_notification::NotificationExt;

/// Show a native macOS notification with title and optional body.
///
/// On macOS desktop, permission is always granted (no prompt needed).
/// Clicking the notification activates/focuses the app window automatically
/// (standard macOS behavior via notify-rust).
#[tauri::command]
pub async fn show_notification(
    app: tauri::AppHandle,
    title: String,
    body: Option<String>,
) -> Result<(), String> {
    let mut builder = app.notification().builder();
    builder = builder.title(&title);

    if let Some(ref b) = body {
        builder = builder.body(b);
    }

    builder.show().map_err(|e| e.to_string())?;

    Ok(())
}
