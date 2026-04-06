use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

/// Check for updates and emit result to the frontend.
///
/// Called once on app startup (after a 5-second delay to not block launch).
/// Also callable on-demand from the frontend via the check_for_update command.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
            };

            // Emit event so the frontend UpdatePrompt can show the banner
            let _ = app.emit("update-available", &info);

            Ok(Some(info))
        }
        Ok(None) => Ok(None),
        Err(e) => {
            eprintln!("Update check failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// Download and install the pending update, then restart the app.
///
/// Called from the frontend when the user clicks "Install Update".
/// Emits progress events during download for the progress bar.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    let app_handle = app.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                let _ = app_handle.emit(
                    "update-download-progress",
                    DownloadProgress {
                        downloaded: chunk_length,
                        total: content_length,
                    },
                );
            },
            || {
                // Download complete — about to install
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    app.restart();
}

/// Schedule an automatic update check 5 seconds after app launch.
pub fn schedule_startup_check(app: &tauri::App) {
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        tauri::async_runtime::block_on(async move {
            let updater = match handle.updater() {
                Ok(u) => u,
                Err(_) => return,
            };

            if let Ok(Some(update)) = updater.check().await {
                let info = UpdateInfo {
                    version: update.version.clone(),
                    body: update.body.clone(),
                    date: update.date.map(|d| d.to_string()),
                };
                let _ = handle.emit("update-available", &info);
            }
        });
    });
}

#[derive(Clone, serde::Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    downloaded: usize,
    total: Option<u64>,
}
