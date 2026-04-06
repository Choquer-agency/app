use tauri_plugin_clipboard_manager::ClipboardExt;

/// Write text to the system clipboard.
///
/// Called from the frontend for structured copy operations
/// (ticket details, Slack-formatted text, client info, etc.)
#[tauri::command]
pub async fn write_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(&text)
        .map_err(|e| e.to_string())
}

/// Read text from the system clipboard.
#[tauri::command]
pub async fn read_clipboard(app: tauri::AppHandle) -> Result<String, String> {
    app.clipboard()
        .read_text()
        .map_err(|e| e.to_string())
}
