use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

/// Check for updates and return info if available.
/// Called on-demand from the Settings > App page.
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
/// Called from the frontend when user manually triggers install,
/// or automatically by the hourly auto-update loop.
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

/// Return the current app version string.
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Start the recurring auto-update loop.
///
/// - First check: 10 seconds after launch (let the app settle)
/// - Subsequent checks: every 1 hour
/// - When an update is found: emit event for UI, then auto-download and auto-restart
pub fn start_auto_update_loop(app: &tauri::App) {
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        // Initial delay — let the app finish launching
        std::thread::sleep(std::time::Duration::from_secs(10));

        loop {
            tauri::async_runtime::block_on(async {
                auto_check_and_install(&handle).await;
            });

            // Wait 1 hour before next check
            std::thread::sleep(std::time::Duration::from_secs(3600));
        }
    });
}

/// Check for an update and auto-install if found.
async fn auto_check_and_install(handle: &AppHandle) {
    let updater = match handle.updater() {
        Ok(u) => u,
        Err(_) => return,
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        _ => return,
    };

    // Notify the frontend that an update is being installed
    let info = UpdateInfo {
        version: update.version.clone(),
        body: update.body.clone(),
        date: update.date.map(|d| d.to_string()),
    };
    let _ = handle.emit("update-available", &info);
    let _ = handle.emit("update-auto-installing", &info);

    // Auto-download and install
    let progress_handle = handle.clone();
    let result = update
        .download_and_install(
            move |chunk_length, content_length| {
                let _ = progress_handle.emit(
                    "update-download-progress",
                    DownloadProgress {
                        downloaded: chunk_length,
                        total: content_length,
                    },
                );
            },
            || {},
        )
        .await;

    match result {
        Ok(_) => {
            // Restart the app with the new version
            handle.restart();
        }
        Err(e) => {
            eprintln!("Auto-update install failed: {}", e);
        }
    }
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
