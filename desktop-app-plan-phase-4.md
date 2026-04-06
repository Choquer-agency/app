# InsightPulse Desktop App — Phase 4: Distribution & Auto-Updates

## Goal

Team members download a signed, notarized DMG, drag InsightPulse to Applications, and the app auto-updates itself when new versions ship. No Gatekeeper warnings, no manual re-downloads. This is the final phase before InsightPulse is a shippable v1.0 desktop app.

---

## What This Phase Delivers

- **Code signing** — The `.app` is signed with a Developer ID Application certificate. macOS trusts it immediately
- **Notarization** — Apple has scanned and approved the app. No "unidentified developer" warning
- **DMG installer** — Professional drag-to-Applications disk image (Universal Binary — works on Intel + Apple Silicon)
- **Auto-updater** — App checks for updates on launch. Non-blocking "Update available" prompt with download progress. One-click install + restart
- **CI/CD pipeline** — Push a `v*` tag → GitHub Actions builds, signs, notarizes, and publishes to GitHub Releases automatically
- **Download page** — Public page at `/download` with version info, download button, installation instructions

---

## Prerequisites

- Phase 1 complete — `src-tauri/` exists with a working Tauri shell
- Phase 2 complete — menu bar, tray, dock badge, deep links, window state memory
- Phase 3 complete — native push notifications, real-time badge, NotificationBridge
- Apple Developer Program membership (already enrolled)
- GitHub repo with Actions enabled

---

## Project Structure After Phase 4

New and modified files shown. Everything else from Phases 1-3 is unchanged.

```
insightpulse/
  src-tauri/
    Cargo.toml                                    # MODIFIED — add tauri-plugin-updater
    tauri.conf.json                               # MODIFIED — add updater config, bump version
    capabilities/default.json                     # MODIFIED — add updater permissions
    entitlements.plist                             # NEW — macOS hardened runtime entitlements
    src/
      lib.rs                                      # MODIFIED — register updater plugin + module
      updater.rs                                  # NEW — update check logic + install handler
  components/
    UpdatePrompt.tsx                               # NEW — "Update available" banner with progress
  app/
    admin/
      layout.tsx                                  # MODIFIED — add <UpdatePrompt>
    api/
      desktop/
        update/
          route.ts                                # NEW — Tauri update manifest endpoint
    download/
      page.tsx                                    # NEW — public download page
  .github/
    workflows/
      build-desktop.yml                           # NEW — CI/CD pipeline
```

---

## File-by-File Specification

### 1. One-Time Setup: Certificate & Key Generation

Before any code changes, you need to generate two things locally.

#### 1A. Export Your Developer ID Certificate

You already have an Apple Developer account. You need the **Developer ID Application** certificate.

```bash
# 1. Open Keychain Access on your Mac
# 2. Go to: Keychain Access > Certificate Assistant > Request a Certificate from a CA
#    - Enter your Apple ID email
#    - Select "Saved to disk"
#    - Save the .certSigningRequest file

# 3. Go to https://developer.apple.com/account/resources/certificates/list
#    - Click "+" to create a new certificate
#    - Select "Developer ID Application"
#    - Upload the .certSigningRequest file
#    - Download the .cer file and double-click to install in Keychain

# 4. Verify it's installed:
security find-identity -v -p codesigning
# Should show: "Developer ID Application: Your Name (TEAM_ID)"

# 5. Export as .p12 for CI (Keychain Access > right-click cert > Export)
#    - Save as developer-id-application.p12
#    - Set a strong password (you'll need this for CI)
#    - DO NOT commit this file — it goes into GitHub Secrets as base64
```

#### 1B. Generate Ed25519 Signing Key for Updates

```bash
# Run from anywhere — this generates a keypair for update signature verification
cargo tauri signer generate -w ~/.tauri/insightpulse.key

# This outputs:
#   - Private key saved to ~/.tauri/insightpulse.key (keep secret — used in CI to sign updates)
#   - Public key printed to stdout (goes into tauri.conf.json — shipped with the app)
#
# Example public key format:
#   dW50cnVzdGVkIGNvbW1lbnQgOiBzaWduaWZ5I...
#
# SAVE BOTH. The private key password is set during generation.
```

#### 1C. GitHub Secrets to Configure

Go to your repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Choquer Agency (XXXXXXXXXX)` | The certificate name shown in `security find-identity` |
| `APPLE_CERTIFICATE` | Base64 of the `.p12` file: `base64 -i developer-id-application.p12` | Certificate for CI keychain import |
| `APPLE_CERTIFICATE_PASSWORD` | Password you set when exporting the `.p12` | Unlocks the certificate in CI |
| `APPLE_ID` | Your Apple ID email | For notarization submission |
| `APPLE_PASSWORD` | App-specific password (generate at appleid.apple.com → Security → App-Specific Passwords) | For notarization submission |
| `APPLE_TEAM_ID` | Your 10-character Team ID (from developer.apple.com → Membership) | For notarization submission |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/insightpulse.key` | Signs update bundles for verification |
| `TAURI_KEY_PASSWORD` | Password you set during key generation | Unlocks the signing key |

---

### 2. `src-tauri/entitlements.plist` (New)

macOS Hardened Runtime requires explicit entitlements. Without these, the signed app crashes on launch because WKWebView needs JIT compilation.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Allow outbound network connections (loading https://choquer.app, Convex WSS, etc.) -->
    <key>com.apple.security.network.client</key>
    <true/>

    <!-- Required for WKWebView JavaScript JIT compilation -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>

    <!-- Required for WKWebView to load unsigned framework code -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>

    <!-- Required for Tauri plugins that load dynamic libraries -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>

    <!-- Allow UserNotifications (Phase 3 native notifications) -->
    <key>com.apple.security.temporary-exception.mach-lookup.global-name</key>
    <array>
        <string>com.apple.usernoted</string>
    </array>
</dict>
</plist>
```

**Why each entitlement:**

| Entitlement | Why |
|-------------|-----|
| `network.client` | The app loads everything from `https://choquer.app` and connects to `*.convex.cloud` via WSS |
| `allow-jit` | WKWebView's JavaScript engine (JavaScriptCore) requires JIT. Without this, the signed app shows a blank white screen |
| `allow-unsigned-executable-memory` | WKWebView allocates executable memory pages for JS compilation. Hardened Runtime blocks this by default |
| `disable-library-validation` | Tauri plugins (`tauri-plugin-notification`, `tauri-plugin-updater`) load as dynamic libraries that aren't signed by Apple |
| `usernoted` | Phase 3's native notification system communicates with macOS's notification daemon via this Mach port |

---

### 3. `src-tauri/Cargo.toml` (Modified)

Add the updater plugin.

```toml
[dependencies]
# ... existing Phase 3 deps ...
tauri-plugin-updater = "2"    # Phase 4 — auto-update support
```

**Why `tauri-plugin-updater`:** Official Tauri v2 plugin for application self-updates. Handles download, signature verification, binary replacement, and app restart. Uses Ed25519 signatures to verify update integrity before applying.

---

### 4. `src-tauri/tauri.conf.json` (Modified)

Add updater configuration and reference the entitlements file.

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/config.schema.json",
  "productName": "InsightPulse",
  "version": "1.0.0",
  "identifier": "agency.choquer.insightpulse",
  "build": {
    "devUrl": "http://localhost:3388",
    "frontendDist": "https://choquer.app"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "InsightPulse",
        "width": 1400,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 700,
        "resizable": true,
        "center": true,
        "decorations": true,
        "transparent": false,
        "backgroundThrottling": false
      }
    ],
    "security": {
      "dangerousRemoteUrlAccess": [
        { "url": "https://choquer.app/**", "enableWebAPIs": true },
        { "url": "https://*.convex.cloud/**", "enableWebAPIs": true },
        { "url": "https://*.convex.site/**", "enableWebAPIs": true },
        { "url": "https://*.vercel-storage.com/**", "enableWebAPIs": true }
      ]
    },
    "trayIcon": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "11.0",
      "entitlements": "entitlements.plist",
      "signingIdentity": null
    }
  },
  "plugins": {
    "opener": {
      "openUrl": true
    },
    "deep-link": {
      "desktop": {
        "schemes": ["insightpulse"]
      }
    },
    "updater": {
      "pubkey": "<YOUR_ED25519_PUBLIC_KEY_HERE>",
      "endpoints": [
        "https://choquer.app/api/desktop/update?target={{target}}&arch={{arch}}&current_version={{current_version}}"
      ]
    }
  }
}
```

**What changed from Phase 3:**
- Added `bundle.macOS.entitlements` pointing to the entitlements file
- Added `bundle.macOS.signingIdentity: null` — Tauri reads the identity from the `APPLE_SIGNING_IDENTITY` env var at build time. Setting `null` means "use the env var" (vs hardcoding the identity)
- Added `plugins.updater` — the public key and endpoint URL for update checks

**How `signingIdentity` works:**
- `null` in config → Tauri looks for `APPLE_SIGNING_IDENTITY` env var
- In local dev (`cargo tauri dev`), the env var is unset → app runs unsigned (fine for development)
- In CI, the env var is set via GitHub Secrets → app is signed automatically
- This means zero config changes between dev and CI builds

**Updater endpoint template variables:**
- `{{target}}` → `darwin` (macOS)
- `{{arch}}` → `aarch64` or `x86_64` (though Universal Binary handles both)
- `{{current_version}}` → the version in this config (e.g., `1.0.0`)

---

### 5. `src-tauri/capabilities/default.json` (Modified)

Add updater permissions.

```json
{
  "$schema": "https://raw.githubusercontent.com/nicegui/nicegui/refs/heads/main/nicegui/static/tauri/capabilities-schema.json",
  "identifier": "default",
  "description": "Default capabilities for InsightPulse desktop app",
  "windows": ["main"],
  "remote": {
    "urls": ["https://choquer.app/*"]
  },
  "permissions": [
    "core:default",
    "opener:default",
    "window-state:default",
    "deep-link:default",
    "notification:default",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "notification:allow-notify",
    "notification:allow-register-action-types",
    "notification:allow-set-badge-count",
    "updater:default",
    "updater:allow-check",
    "updater:allow-download-and-install"
  ]
}
```

**New permissions:**
- `updater:default` — basic updater functionality
- `updater:allow-check` — allows the frontend to trigger update checks
- `updater:allow-download-and-install` — allows the frontend to download and install updates

---

### 6. `src-tauri/src/updater.rs` (New)

Handles update checking on app launch and exposes commands for the frontend.

```rust
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use tauri::Emitter;

/// Check for updates and emit result to the frontend
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
                date: update.date.clone(),
            };

            // Emit event so the frontend UpdatePrompt can show the banner
            let _ = app.emit("update-available", &info);

            Ok(Some(info))
        }
        Ok(None) => Ok(None), // Already on latest version
        Err(e) => {
            // Non-fatal — log but don't crash. User can still use the app.
            eprintln!("Update check failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// Download and install the pending update, then restart the app
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

    // Download with progress reporting
    let app_handle = app.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                // Emit download progress to the frontend
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

    // Restart the app to apply the update
    app.restart();
}

/// Schedule an automatic update check after app launch
///
/// Called from setup() in lib.rs. Waits 5 seconds to let the app
/// fully load before checking (non-blocking).
pub fn schedule_startup_check(app: &tauri::App) {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // Wait 5 seconds so the app is fully loaded before checking
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        let updater = match handle.updater() {
            Ok(u) => u,
            Err(_) => return,
        };

        if let Ok(Some(update)) = updater.check().await {
            let info = UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
                date: update.date.clone(),
            };
            let _ = handle.emit("update-available", &info);
        }
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
```

**Design decisions:**

| Decision | Rationale |
|----------|-----------|
| 5-second delay on startup | Don't block the app launch with a network request. User sees the app immediately; update check happens silently in background |
| Emit events to frontend | The Rust side detects updates; the React side shows the UI. Clean separation — Rust handles the mechanics, React handles the presentation |
| Progress events during download | Users want to see download progress, not a spinning indicator with no context. Tauri's `download_and_install` callback gives us chunk-level progress |
| `app.restart()` after install | Tauri replaces the binary in-place during install. Restarting loads the new version. The user's session cookie persists (WKWebView data store is separate from the app binary) |
| Non-fatal error handling | If the update server is down, the app still works. Updates are a nice-to-have, not a gate |

---

### 7. `src-tauri/src/lib.rs` (Modified)

Register the updater module, plugin, and commands.

```rust
mod menu;
mod tray;
mod dock;
mod bridge;
mod deep_link;
mod notifications;
mod updater;        // NEW — Phase 4

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())  // NEW — Phase 4
        // Commands callable from JavaScript
        .invoke_handler(tauri::generate_handler![
            dock::update_dock_badge,
            notifications::show_notification,
            notifications::set_badge_count,
            notifications::check_notification_permission,
            updater::check_for_update,      // NEW — Phase 4
            updater::install_update,        // NEW — Phase 4
        ])
        // App setup
        .setup(|app| {
            // Phase 2 setup
            let menu = menu::build_menu(app)?;
            app.set_menu(menu)?;
            tray::setup_tray(app.handle())?;
            deep_link::setup_deep_links(app)?;

            // Phase 3 setup
            notifications::setup_notification_actions(app);

            // Phase 4: Schedule automatic update check after 5s delay
            updater::schedule_startup_check(app);

            // ... rest of Phase 2-3 setup (window events, navigation, bridge) ...

            let main_window = app
                .get_webview_window("main")
                .expect("main window not found");

            // Hide-on-close (Phase 2)
            let window_for_close = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            // JS bridge injection (Phase 2)
            let window_for_bridge = main_window.clone();
            main_window.on_page_load(move |_webview, payload| {
                if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                    bridge::inject_all(&window_for_bridge);
                }
            });

            // External link interception (Phase 1)
            main_window.on_navigation(move |url| {
                let allowed_domains = [
                    "choquer.app",
                    "convex.cloud",
                    "convex.site",
                    "vercel-storage.com",
                    "localhost",
                ];

                let is_allowed = allowed_domains.iter().any(|domain| {
                    url.host_str()
                        .map_or(false, |h| h == *domain || h.ends_with(&format!(".{}", domain)))
                });

                if is_allowed {
                    true
                } else {
                    let _ = open::that(url.as_str());
                    false
                }
            });

            Ok(())
        })
        .on_menu_event(menu::handle_menu_event)
        .run(tauri::generate_context!())
        .expect("error while running InsightPulse");
}
```

**What changed from Phase 3:**
- Added `mod updater;`
- Added `.plugin(tauri_plugin_updater::Builder::new().build())`
- Added 2 updater commands to `invoke_handler`
- Added `updater::schedule_startup_check(app)` in setup

---

### 8. `app/api/desktop/update/route.ts` (New)

The update manifest endpoint. Tauri's updater plugin calls this URL to check for updates.

**Tauri expects a specific response format:**
- **200 + JSON** when an update is available
- **204 No Content** when already on the latest version

```typescript
import { NextRequest, NextResponse } from "next/server";

// Cache the GitHub API response for 5 minutes to avoid rate limits
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedRelease: { data: GitHubRelease; fetchedAt: number } | null = null;

interface GitHubRelease {
  tag_name: string;
  body: string | null;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currentVersion = searchParams.get("current_version");
  const target = searchParams.get("target"); // "darwin"
  const arch = searchParams.get("arch"); // "aarch64" or "x86_64"

  if (!currentVersion) {
    return NextResponse.json(
      { error: "current_version is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch latest release from GitHub (with in-memory cache)
    const release = await getLatestRelease();

    if (!release) {
      // No releases published yet
      return new NextResponse(null, { status: 204 });
    }

    // Compare versions: strip "v" prefix from tag (e.g., "v1.1.0" → "1.1.0")
    const latestVersion = release.tag_name.replace(/^v/, "");

    if (!isNewerVersion(latestVersion, currentVersion)) {
      // Already on latest — Tauri expects 204
      return new NextResponse(null, { status: 204 });
    }

    // Find the signature file and the update bundle in the release assets
    // Universal Binary: look for the .tar.gz (Tauri's update format) and .sig file
    const updateAsset = release.assets.find(
      (a) => a.name.endsWith(".app.tar.gz")
    );
    const signatureAsset = release.assets.find(
      (a) => a.name.endsWith(".app.tar.gz.sig")
    );

    if (!updateAsset || !signatureAsset) {
      // Release exists but no valid update assets — treat as no update
      return new NextResponse(null, { status: 204 });
    }

    // Fetch the signature content (it's a small text file)
    const signatureResponse = await fetch(signatureAsset.browser_download_url);
    const signature = await signatureResponse.text();

    // Return Tauri update manifest format
    return NextResponse.json({
      version: latestVersion,
      notes: release.body || "Bug fixes and improvements.",
      pub_date: release.published_at,
      platforms: {
        // Universal Binary works for both architectures
        "darwin-aarch64": {
          signature: signature.trim(),
          url: updateAsset.browser_download_url,
        },
        "darwin-x86_64": {
          signature: signature.trim(),
          url: updateAsset.browser_download_url,
        },
      },
    });
  } catch (error) {
    console.error("Update check failed:", error);
    // On error, return 204 (no update) rather than 500
    // This prevents the app from showing error states for a non-critical feature
    return new NextResponse(null, { status: 204 });
  }
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  // Return cached data if fresh
  if (cachedRelease && Date.now() - cachedRelease.fetchedAt < CACHE_TTL_MS) {
    return cachedRelease.data;
  }

  // GitHub API — public repos don't need auth for this endpoint
  // For private repos, add a GITHUB_TOKEN secret and pass as Bearer token
  const response = await fetch(
    "https://api.github.com/repos/OWNER/REPO/releases/latest",
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "InsightPulse-Updater",
      },
      next: { revalidate: 300 }, // ISR: revalidate every 5 minutes
    }
  );

  if (response.status === 404) {
    // No releases yet
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data: GitHubRelease = await response.json();
  cachedRelease = { data, fetchedAt: Date.now() };
  return data;
}

/**
 * Compare semantic versions. Returns true if `latest` is newer than `current`.
 * Handles standard semver: "1.2.3" > "1.2.2", "1.3.0" > "1.2.9", etc.
 */
function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false; // Equal versions
}
```

**Key decisions:**

| Decision | Rationale |
|----------|-----------|
| 204 on error | The app should never be blocked by a failed update check. 204 means "no update" — the app continues normally |
| In-memory cache | GitHub API has rate limits (60 req/hour unauthenticated). With ~10-20 team members checking on launch, 5-minute cache prevents hitting limits |
| Single Universal Binary URL for both platforms | Universal Binary means the same `.tar.gz` works for `darwin-aarch64` and `darwin-x86_64`. Both platform entries point to the same asset |
| Signature fetched from GitHub | The `.sig` file is generated by `cargo tauri build` alongside the update bundle. Uploading it to GitHub Releases keeps everything in one place |
| No auth required | This endpoint is public. The update manifest contains only version info and download URLs (already public via GitHub Releases). No sensitive data exposed |
| `OWNER/REPO` placeholder | Replace with your actual GitHub repo path (e.g., `choquer-agency/insightpulse`) |

**Tauri update manifest format:**
```json
{
  "version": "1.1.0",
  "notes": "Release notes from GitHub",
  "pub_date": "2026-04-06T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "base64-encoded-ed25519-signature",
      "url": "https://github.com/.../InsightPulse.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "base64-encoded-ed25519-signature",
      "url": "https://github.com/.../InsightPulse.app.tar.gz"
    }
  }
}
```

---

### 9. `components/UpdatePrompt.tsx` (New)

Non-blocking banner that appears when an update is available. Shows download progress during installation.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

export default function UpdatePrompt() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);

  const isTauri = useCallback(() => {
    return (
      typeof window !== "undefined" &&
      !!(window as unknown as { __TAURI__: unknown }).__TAURI__
    );
  }, []);

  // Listen for "update-available" event from Rust
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.event
      .listen("update-available", (event: { payload: UpdateInfo }) => {
        setUpdate(event.payload);
      })
      .then((fn: () => void) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauri]);

  // Listen for download progress events
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.event
      .listen(
        "update-download-progress",
        (event: { payload: DownloadProgress }) => {
          const { downloaded, total } = event.payload;
          if (total && total > 0) {
            setProgress(Math.round((downloaded / total) * 100));
          }
        }
      )
      .then((fn: () => void) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauri]);

  const handleInstall = async () => {
    if (!isTauri()) return;
    setInstalling(true);
    setProgress(0);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).__TAURI__.core.invoke("install_update");
      // App will restart automatically — this line won't be reached
    } catch (error) {
      console.error("Update install failed:", error);
      setInstalling(false);
      setProgress(0);
    }
  };

  // Don't render in browser or if no update or dismissed
  if (!isTauri() || !update || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <svg
            className="w-4 h-4 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            Update available — v{update.version}
          </p>
          {update.body && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {update.body}
            </p>
          )}

          {installing ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Downloading...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Install & Restart
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Design decisions:**

| Decision | Rationale |
|----------|-----------|
| Fixed bottom-right position | Non-intrusive — doesn't cover navigation or content. Similar to Slack's update prompt |
| "Later" dismisses for this session | User isn't nagged repeatedly. Next app launch will check again |
| Progress bar during download | Transparency — user knows something is happening, not frozen |
| `app.restart()` on complete | Tauri replaces the binary in-place, then restarts. Session cookie persists — user stays logged in |
| No-op in browser | `isTauri()` check prevents any rendering in the web app |

---

### 10. `app/admin/layout.tsx` (Modified)

Add the UpdatePrompt component.

```tsx
import UpdatePrompt from "@/components/UpdatePrompt";

// Inside the authenticated branch (session exists):
return (
  <div className="min-h-screen bg-white" style={{ fontSize: "80%" }}>
    <KeyboardShortcutProvider>
      <AdminNav
        userName={session.name}
        roleLevel={session.roleLevel}
        profilePicUrl={profilePicUrl}
      />
      <NotificationBridge teamMemberId={session.teamMemberId} />
      <UpdatePrompt />
      <div className="max-w-[1400px] mx-auto px-10 py-8 pb-20">
        {children}
      </div>
      <FloatingTimerBar />
      <GlobalTicketModal />
    </KeyboardShortcutProvider>
  </div>
);
```

---

### 11. `.github/workflows/build-desktop.yml` (New)

Complete CI/CD pipeline for building, signing, notarizing, and publishing the desktop app.

```yaml
name: Build InsightPulse Desktop

on:
  push:
    tags:
      - "v*" # Triggered by version tags: v1.0.0, v1.1.0, etc.
  workflow_dispatch: # Manual trigger for testing

env:
  RUST_BACKTRACE: 1

jobs:
  build:
    runs-on: macos-14 # Apple Silicon runner — builds Universal Binary

    permissions:
      contents: write # Required for creating GitHub Releases

    steps:
      # ── Checkout ──
      - name: Checkout repository
        uses: actions/checkout@v4

      # ── Setup Node.js ──
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: insightpulse/package-lock.json

      # ── Install Node dependencies ──
      - name: Install dependencies
        working-directory: insightpulse
        run: npm ci

      # ── Setup Rust toolchain ──
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      # ── Cache Rust build artifacts ──
      - name: Cache Rust
        uses: swatinem/rust-cache@v2
        with:
          workspaces: insightpulse/src-tauri -> target
          cache-on-failure: true

      # ── Import Apple signing certificate into CI keychain ──
      - name: Import Apple certificate
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        run: |
          # Create a temporary keychain
          KEYCHAIN_PATH=$RUNNER_TEMP/app-signing.keychain-db
          KEYCHAIN_PASSWORD=$(openssl rand -base64 32)

          security create-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH
          security set-keychain-settings -lut 21600 $KEYCHAIN_PATH
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH

          # Decode and import the .p12 certificate
          echo "$APPLE_CERTIFICATE" | base64 --decode > $RUNNER_TEMP/certificate.p12
          security import $RUNNER_TEMP/certificate.p12 \
            -k $KEYCHAIN_PATH \
            -P "$APPLE_CERTIFICATE_PASSWORD" \
            -T /usr/bin/codesign \
            -T /usr/bin/security

          # Allow codesign to use the keychain without prompting
          security set-key-partition-list -S apple-tool:,apple:,codesign: \
            -s -k "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH

          # Add to the keychain search list (so codesign finds it)
          security list-keychains -d user -s $KEYCHAIN_PATH login.keychain-db

      # ── Build, sign, notarize ──
      - name: Build Tauri app (Universal Binary)
        working-directory: insightpulse
        env:
          # Signing
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          # Notarization
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # Update signing
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
        run: |
          cargo tauri build --target universal-apple-darwin

      # ── Gather build artifacts ──
      - name: Gather artifacts
        id: artifacts
        working-directory: insightpulse
        run: |
          # Tauri outputs to src-tauri/target/universal-apple-darwin/release/bundle/
          BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"

          # Find the DMG
          DMG_PATH=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" -type f | head -1)
          echo "dmg_path=$DMG_PATH" >> $GITHUB_OUTPUT
          echo "dmg_name=$(basename $DMG_PATH)" >> $GITHUB_OUTPUT

          # Find the update bundle (.app.tar.gz) and its signature (.sig)
          UPDATE_PATH=$(find "$BUNDLE_DIR/macos" -name "*.app.tar.gz" -type f | head -1)
          SIG_PATH="${UPDATE_PATH}.sig"
          echo "update_path=$UPDATE_PATH" >> $GITHUB_OUTPUT
          echo "update_name=$(basename $UPDATE_PATH)" >> $GITHUB_OUTPUT
          echo "sig_path=$SIG_PATH" >> $GITHUB_OUTPUT
          echo "sig_name=$(basename $SIG_PATH)" >> $GITHUB_OUTPUT

          # Generate checksums
          shasum -a 256 "$DMG_PATH" > "$BUNDLE_DIR/checksums.txt"
          shasum -a 256 "$UPDATE_PATH" >> "$BUNDLE_DIR/checksums.txt"
          echo "checksums_path=$BUNDLE_DIR/checksums.txt" >> $GITHUB_OUTPUT

      # ── Create GitHub Release ──
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        if: startsWith(github.ref, 'refs/tags/')
        with:
          draft: false
          prerelease: false
          generate_release_notes: true
          files: |
            insightpulse/${{ steps.artifacts.outputs.dmg_path }}
            insightpulse/${{ steps.artifacts.outputs.update_path }}
            insightpulse/${{ steps.artifacts.outputs.sig_path }}
            insightpulse/${{ steps.artifacts.outputs.checksums_path }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # ── Cleanup keychain ──
      - name: Cleanup keychain
        if: always()
        run: |
          security delete-keychain $RUNNER_TEMP/app-signing.keychain-db || true
```

**Pipeline flow:**

```
Push tag v1.1.0
  → GitHub Actions triggers on macos-14 (Apple Silicon)
    → Installs Node 22, Rust stable + both targets
    → npm ci (cached)
    → Imports .p12 certificate into temporary keychain
    → cargo tauri build --target universal-apple-darwin
      → Tauri internally:
        1. Compiles Rust for aarch64 + x86_64
        2. Creates Universal Binary via lipo
        3. Signs with Developer ID certificate (codesign)
        4. Notarizes with Apple (xcrun notarytool submit + wait)
        5. Staples notarization ticket (xcrun stapler staple)
        6. Creates .dmg installer
        7. Creates .app.tar.gz update bundle
        8. Signs update bundle with Ed25519 key → .sig file
    → Uploads DMG + update bundle + signature + checksums to GitHub Release
    → Cleans up temporary keychain
```

**Why Universal Binary:**
- One DMG works on 2020 Intel iMacs and latest Apple Silicon MacBooks
- Simpler CI (one build job, not two)
- Simpler download page (one button, no architecture detection)
- Trade-off: ~2x file size (~20-30MB vs ~10-15MB), acceptable for an internal team app
- The macOS `lipo` tool merges both architecture binaries into a single fat binary

**Build time estimate:** ~15-20 minutes (Rust compilation for two architectures + notarization wait)

---

### 12. `app/download/page.tsx` (New)

Public download page — no auth required.

```tsx
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download InsightPulse Desktop",
  description:
    "Download InsightPulse for macOS — native desktop app with notifications, dock badge, and auto-updates.",
};

interface GitHubRelease {
  tag_name: string;
  body: string | null;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/OWNER/REPO/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "InsightPulse-Download",
        },
        next: { revalidate: 300 }, // Revalidate every 5 minutes
      }
    );

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DownloadPage() {
  const release = await getLatestRelease();

  const dmgAsset = release?.assets.find((a) => a.name.endsWith(".dmg"));
  const version = release?.tag_name?.replace(/^v/, "") || "—";
  const publishedDate = release?.published_at
    ? new Date(release.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-gray-900">
            InsightPulse Desktop
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Native macOS app with real-time notifications and auto-updates
          </p>
        </div>

        {/* Download Card */}
        <div className="border border-gray-200 rounded-xl p-6">
          {dmgAsset ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    macOS (Universal)
                  </p>
                  <p className="text-xs text-gray-500">
                    Intel &amp; Apple Silicon
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    v{version}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatBytes(dmgAsset.size)}
                  </p>
                </div>
              </div>
              <a
                href={dmgAsset.browser_download_url}
                className="block w-full text-center px-4 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Download for macOS
              </a>
              {publishedDate && (
                <p className="text-xs text-gray-400 text-center mt-3">
                  Released {publishedDate}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              No releases available yet.
            </p>
          )}
        </div>

        {/* Installation Instructions */}
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-900 mb-3">
            Installation
          </h2>
          <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside">
            <li>Download the DMG file above</li>
            <li>Open the DMG — drag InsightPulse to your Applications folder</li>
            <li>
              Open InsightPulse from Applications — log in with your admin
              credentials
            </li>
            <li>
              The app will auto-update when new versions are available
            </li>
          </ol>
        </div>

        {/* System Requirements */}
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-900 mb-2">
            Requirements
          </h2>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>macOS 11 (Big Sur) or later</li>
            <li>Intel or Apple Silicon Mac</li>
            <li>Internet connection required</li>
          </ul>
        </div>

        {/* Release Notes */}
        {release?.body && (
          <div className="mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">
              What&apos;s New
            </h2>
            <div className="text-xs text-gray-600 prose prose-xs max-w-none">
              <pre className="whitespace-pre-wrap font-sans">
                {release.body}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Design decisions:**

| Decision | Rationale |
|----------|-----------|
| Server component | Fetches GitHub Release at build/ISR time. No client-side loading states |
| ISR (5-minute revalidation) | Download page stays fresh without a redeploy after each release |
| No architecture detection | Universal Binary = one download button for all Macs |
| No auth | Anyone with the URL can download. The app requires login, so the DMG alone is useless without credentials |
| Clean minimal design | Matches the admin portal's simple aesthetic (per feedback: no gradients) |
| `OWNER/REPO` placeholder | Replace with actual GitHub repo path |

---

## How the Update Flow Works (End-to-End)

### Publishing a New Version

```
1. Bump version in src-tauri/tauri.conf.json (e.g., "1.0.0" → "1.1.0")
2. Commit and push
3. Create and push a tag:
   git tag v1.1.0
   git push origin v1.1.0
4. GitHub Actions triggers automatically
5. ~15-20 minutes later: signed, notarized DMG + update bundle published to GitHub Releases
6. Download page updates within 5 minutes (ISR revalidation)
```

### Existing Users Receiving the Update

```
1. User opens InsightPulse (or it's already running)
2. 5 seconds after launch, updater.rs checks https://choquer.app/api/desktop/update
3. API route fetches GitHub Releases, finds v1.1.0 > v1.0.0
4. Returns 200 + update manifest (version, URL, signature)
5. Rust emits "update-available" event to the frontend
6. UpdatePrompt.tsx shows "Update available — v1.1.0" banner (bottom-right)
7. User clicks "Install & Restart"
8. Tauri downloads the .app.tar.gz from GitHub Releases
9. Progress events → UpdatePrompt shows download progress bar
10. Tauri verifies Ed25519 signature against the public key in tauri.conf.json
11. Signature valid → Tauri replaces the app binary in-place
12. App restarts automatically → user is on v1.1.0
13. Session cookie persists — user is still logged in
```

### First-Time Installation

```
1. User visits https://choquer.app/download
2. Downloads InsightPulse.dmg
3. Opens DMG → drags InsightPulse.app to Applications
4. Launches InsightPulse — no Gatekeeper warning (signed + notarized)
5. Logs in with admin credentials
6. From here on, auto-updater handles all future versions
```

---

## Edge Cases & How They're Handled

| Scenario | Behavior | Why |
|----------|----------|-----|
| **Update server down** | App works normally, no update prompt | `check_for_update` catches errors silently; API route returns 204 on error |
| **GitHub API rate limited** | Cached response served (5-min TTL) | In-memory cache in the API route prevents repeated GitHub calls |
| **User dismisses update** | Prompt hidden for this session | "Later" sets `dismissed` state. Next app launch re-checks |
| **User on v1.0.0, latest is v1.5.0** | Update prompt shows v1.5.0 | Tauri updates directly to latest — no incremental update chain needed |
| **Download interrupted** | Update fails, error caught, user can retry | Tauri handles download resumption internally; if it fails completely, next launch re-checks |
| **Tampered update binary** | Signature verification fails → update rejected | Ed25519 signature must match the public key baked into the app. No way to bypass without the private key |
| **Certificate revoked by Apple** | Existing installs continue working. New installs fail Gatekeeper | Re-create certificate, update GitHub Secrets, rebuild. Existing users get auto-update with new cert |
| **Disk space insufficient** | Tauri reports error, caught by `install_update` | App continues working on current version. User sees error in console, not a crash |
| **Update during active work** | User controls when to install (clicks "Install & Restart") | Non-blocking prompt — user finishes their work, then installs when ready |
| **Multiple rapid tag pushes** | Each tag triggers a build. Latest tag = latest release | GitHub Releases shows all versions; API route always returns the latest |
| **macOS blocks the DMG** | Can't happen — app is notarized | Apple's notarization removes the quarantine flag. Gatekeeper trusts it |
| **User on macOS 10.x** | DMG won't install (minimum is 11.0) | `minimumSystemVersion: "11.0"` in tauri.conf.json. macOS shows a version error |
| **Universal Binary on Rosetta** | Works perfectly | The UB contains both native ARM and x86_64 code. Rosetta isn't needed on Apple Silicon; Intel Macs run the x86_64 slice |
| **No GitHub Releases exist** | Download page shows "No releases available" | API route returns 204; download page handles null release |
| **Browser visits update endpoint** | Gets 204 or update JSON (harmless) | No sensitive data — just version info and public download URLs |
| **App auto-starts after update** | App restarts into updated version, user still logged in | `app.restart()` relaunches the app. WKWebView data store (cookies) persists separately from the binary |

---

## Verification Checklist

### Code Signing & Notarization
- [ ] `security find-identity -v -p codesigning` shows your Developer ID Application certificate
- [ ] `cargo tauri build` with `APPLE_SIGNING_IDENTITY` env var produces a signed `.app`
- [ ] `codesign -dv --verbose=4 InsightPulse.app` shows valid signature with Hardened Runtime
- [ ] `spctl --assess --type exec InsightPulse.app` returns "accepted"
- [ ] `spctl --assess --type install InsightPulse.dmg` returns "accepted"
- [ ] No "unidentified developer" warning when opening the `.app`
- [ ] App launches and functions normally when signed (entitlements are correct)

### Auto-Updater
- [ ] Ed25519 keypair generated; public key in `tauri.conf.json`
- [ ] `/api/desktop/update?current_version=0.0.1` returns 200 + manifest (when a release exists)
- [ ] `/api/desktop/update?current_version=99.99.99` returns 204 (no update)
- [ ] App launch → 5-second delay → "Update available" banner appears (when update exists)
- [ ] Click "Install & Restart" → progress bar shows download progress
- [ ] Download completes → app restarts → running new version
- [ ] After restart, user is still logged in (cookie persisted)
- [ ] If update endpoint is unreachable, app works normally (no error state)
- [ ] Dismiss "Later" → banner disappears for this session
- [ ] Next app launch → banner reappears

### CI/CD Pipeline
- [ ] Push `v1.0.0` tag → GitHub Actions workflow triggers
- [ ] Workflow completes (~15-20 minutes)
- [ ] GitHub Release created with: `.dmg`, `.app.tar.gz`, `.app.tar.gz.sig`, `checksums.txt`
- [ ] DMG downloads and installs correctly
- [ ] `.app.tar.gz` is a valid Tauri update bundle
- [ ] `.sig` file contains a valid Ed25519 signature
- [ ] Checksums match the actual file hashes
- [ ] `workflow_dispatch` manual trigger works

### Download Page
- [ ] `https://choquer.app/download` loads without auth
- [ ] Shows current version and release date
- [ ] Download button links to the DMG on GitHub Releases
- [ ] File size is displayed
- [ ] "What's New" section shows release notes from GitHub
- [ ] Page updates within 5 minutes of a new GitHub Release (ISR)
- [ ] "No releases available" shown when no releases exist

### Integration (with Phases 1-3)
- [ ] All Phase 1 functionality works (login, navigation, file ops, external links)
- [ ] All Phase 2 functionality works (menu bar, tray, dock badge, deep links, window state)
- [ ] All Phase 3 functionality works (native notifications, real-time badge)
- [ ] Full lifecycle: download DMG → install → login → use → receive update → install → still logged in
- [ ] Both Intel iMac and Apple Silicon MacBook can install and run the Universal Binary

---

## Risks & Mitigations (Phase 4 Specific)

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Apple notarization fails | Medium | Most common cause: missing entitlements. The entitlements.plist covers all known WKWebView + Tauri requirements. If it fails, Apple's notarization log (via `xcrun notarytool log`) shows the exact issue |
| GitHub Actions macOS runner changes | Low | Pin `macos-14` specifically. If Apple Silicon runners change, update the workflow |
| Ed25519 private key leaked | Very Low | Key is only in GitHub Secrets (encrypted at rest). Never committed to repo. If compromised, regenerate key, update secrets, push new version — old versions stop updating (public key mismatch) |
| Universal Binary much larger than expected | Low | Typical Tauri apps are ~15MB per arch, ~25-30MB universal. Acceptable for an internal team app over broadband |
| GitHub Releases rate limited for downloads | Very Low | At ~10-20 team members, nowhere near GitHub's download limits. If concerned, mirror to Vercel Blob |
| `tauri-plugin-updater` v2 API differs from expected | Medium | Pin version in Cargo.toml. Test locally with a fake update before relying on CI. The update check → download → install flow is the most critical path to validate early |
| Notarization takes too long (>30 min) | Low | Apple's notarization usually completes in 5-10 minutes. `notarytool submit --wait` has a configurable timeout. If slow, split the workflow: build + upload as draft, notarize + publish in a follow-up |
| Certificate expires | Certain (annually) | Apple Developer ID certificates last 5 years. Set a calendar reminder. When it expires, generate a new one, update the `.p12` in GitHub Secrets |
| User has an ancient version that can't auto-update | Very Low | Tauri's updater supports jumping from any version to latest. If the update format changes drastically in a future Tauri version, those users would need to manually download from `/download` |

---

## Implementation Sequence

### Step 1: Certificate & Key Setup (Local)
- Generate/export Developer ID Application certificate
- Generate Ed25519 signing keypair
- Configure all 8 GitHub Secrets
- **Verify:** `security find-identity` shows cert, `~/.tauri/insightpulse.key` exists

### Step 2: Entitlements File
**Files:** `src-tauri/entitlements.plist` (new)
- Create the entitlements plist with all 5 entitlements
- **Verify:** `cargo tauri build` with `APPLE_SIGNING_IDENTITY` set locally → signed app launches and works

### Step 3: Updater Plugin Setup
**Files:** `Cargo.toml`, `capabilities/default.json`, `tauri.conf.json`, `updater.rs` (new), `lib.rs`
- Add `tauri-plugin-updater` dependency
- Add updater permissions to capabilities
- Add updater config to tauri.conf.json (with your public key)
- Create `updater.rs` with commands and startup check
- Register in `lib.rs`
- **Verify:** App builds. WebView console: `window.__TAURI__.core.invoke("check_for_update")` returns `null` (no releases yet)

### Step 4: Update API Route
**Files:** `app/api/desktop/update/route.ts` (new)
- Create the route following Tauri's update manifest format
- Replace `OWNER/REPO` with your actual GitHub repo path
- **Verify:** `curl "https://choquer.app/api/desktop/update?current_version=0.0.1"` returns 204 (no releases yet)

### Step 5: CI/CD Pipeline
**Files:** `.github/workflows/build-desktop.yml` (new)
- Create the workflow file
- Push to main, then create tag: `git tag v1.0.0 && git push origin v1.0.0`
- **Verify:** GitHub Actions runs, completes in ~15-20 min, creates a Release with DMG + tar.gz + sig + checksums

### Step 6: Verify Signed Distribution
- Download the DMG from GitHub Releases
- Open DMG, drag to Applications
- **Verify:** No Gatekeeper warning. App launches, loads `https://choquer.app`, all features work

### Step 7: UpdatePrompt Component
**Files:** `components/UpdatePrompt.tsx` (new), `app/admin/layout.tsx`
- Create the update banner component
- Add to admin layout
- **Verify:** Bump version to `1.1.0`, push tag `v1.1.0`. After CI completes, open the v1.0.0 app → "Update available" banner appears within 5 seconds

### Step 8: Test Full Update Cycle
- Click "Install & Restart" on the update banner
- **Verify:** Progress bar shows download progress. App restarts. `tauri.conf.json` version is now `1.1.0`. User is still logged in. All features work.

### Step 9: Download Page
**Files:** `app/download/page.tsx` (new)
- Create the public download page
- Replace `OWNER/REPO` with actual repo path
- **Verify:** Visit `https://choquer.app/download`. Shows version, download button, instructions. DMG downloads correctly.

### Step 10: End-to-End Integration Test
- Fresh Mac (or new user account): visit `/download` → install → login → use all features → receive update notification → install → verify everything still works
- Test on both Intel iMac and Apple Silicon MacBook

---

## Version Management Strategy

### How to release a new version:

```bash
# 1. Make your code changes (Next.js, Rust, or both)

# 2. Bump version in tauri.conf.json
# Edit "version": "1.0.0" → "version": "1.1.0"

# 3. Commit
git add -A
git commit -m "Release v1.1.0 — description of changes"

# 4. Tag and push
git tag v1.1.0
git push origin main --tags

# 5. GitHub Actions handles the rest:
#    Build → Sign → Notarize → Publish → Auto-update reaches users
```

### Versioning convention:
- **Major** (2.0.0): Breaking changes, major redesign
- **Minor** (1.1.0): New features, significant improvements
- **Patch** (1.0.1): Bug fixes, minor tweaks

### What triggers auto-update for existing users:
- Any new GitHub Release with a higher version than the user's current version
- The user must open the app (or have it running in the tray) for the check to happen
- Updates are checked on every app launch (5-second delay)

---

## What This Phase Does NOT Include

| Feature | Phase | Why deferred |
|---------|-------|-------------|
| Windows/Linux builds | Phase 6 | Team is macOS-only; Tauri supports these targets when needed |
| Automatic version bumping | Future | Manual bump is fine for the team's release cadence |
| Release channels (beta/stable) | Future | Not needed for ~10-20 users; everyone gets the same version |
| Delta updates | Future | Full binary replacement is fast enough at ~25MB; delta updates add complexity |
| In-app changelog | Future | Release notes shown in update prompt and download page are sufficient |
| Sparkle framework | N/A | Tauri has its own updater; Sparkle is for native Cocoa apps |
| MDM distribution | N/A | Not needed for a small internal team |

---

## Estimated Output

After Phase 4 is complete:

- **3 new files (Rust)** — `entitlements.plist`, `updater.rs`, + updater plugin in Cargo.toml
- **3 modified files (Rust)** — `Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `lib.rs`
- **3 new files (Web)** — `UpdatePrompt.tsx`, `app/api/desktop/update/route.ts`, `app/download/page.tsx`
- **1 modified file (Web)** — `app/admin/layout.tsx` (1 line)
- **1 new file (CI)** — `.github/workflows/build-desktop.yml`
- **8 GitHub Secrets** — Apple signing + notarization + Ed25519 key
- **~25-30 MB** Universal Binary DMG (signed + notarized)
- Zero Gatekeeper warnings on installation
- Auto-updates reaching all users within minutes of a new tag push
- Public download page at `/download`
