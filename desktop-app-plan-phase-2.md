# InsightPulse Desktop App — Phase 2: Native macOS Feel

## Goal

Transform the Phase 1 Tauri shell into a proper macOS citizen. After Phase 2, the app has a native menu bar with keyboard shortcuts, a system tray icon, dock badge showing unread notifications, window position/size memory, and deep link support — all without touching a single line of the existing Next.js codebase.

---

## What This Phase Delivers

- **Menu bar** — Standard macOS menus (InsightPulse, File, Edit, View, Window) with Cmd+1-6 navigation shortcuts
- **System tray** — Menu bar icon. Left-click shows the app. Right-click opens a full navigation context menu
- **Hide-to-tray** — Cmd+W / red close button hides the window instead of quitting. App stays alive. Cmd+Q fully quits
- **Dock badge** — Unread notification count on the dock icon, synced from the existing 30-second notification poll
- **Window state memory** — Window position, size, and maximized state persist across restarts
- **Deep links** — `insightpulse://admin/tickets?ticket=CHQ-042` opens the app and navigates directly
- **Desktop detection** — `window.insightpulse.isDesktop` available in JavaScript for future feature gating

---

## Prerequisites

Phase 1 must be complete — the `src-tauri/` directory exists with a working Tauri shell that loads the app.

---

## Project Structure After Phase 2

New and modified files shown. Everything else from Phase 1 is unchanged.

```
insightpulse/src-tauri/
  Cargo.toml                     # MODIFIED — new deps
  tauri.conf.json                # MODIFIED — tray, deep-link config
  capabilities/default.json      # MODIFIED — new permissions + remote access
  src/
    main.rs                      # unchanged from Phase 1
    lib.rs                       # MODIFIED — registers modules, plugins, commands, events
    menu.rs                      # NEW — menu bar construction + event handling
    tray.rs                      # NEW — system tray setup + context menu
    dock.rs                      # NEW — dock badge via objc FFI
    bridge.rs                    # NEW — JS injection (desktop detection + dock badge sync)
    deep_link.rs                 # NEW — insightpulse:// URL scheme handler
  icons/
    tray-icon.png                # NEW — 22x22 monochrome template icon for menu bar
    tray-icon@2x.png             # NEW — 44x44 Retina version
    (existing app icons)         # unchanged from Phase 1
```

---

## File-by-File Specification

### 1. `src-tauri/Cargo.toml` (Modified)

Phase 1 deps plus new Phase 2 additions.

```toml
[package]
name = "insightpulse"
version = "1.1.0"
edition = "2021"

[lib]
name = "insightpulse_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# Core
tauri = { version = "2", features = ["tray-icon"] }   # tray-icon feature added for Phase 2
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Plugins
tauri-plugin-opener = "2"                              # Phase 1 — external links
tauri-plugin-window-state = "2"                        # Phase 2 — window position/size memory
tauri-plugin-deep-link = "2"                           # Phase 2 — insightpulse:// URL scheme

# macOS native APIs
objc = "0.2"                                           # Phase 2 — Objective-C FFI for dock badge
cocoa = "0.26"                                         # Phase 2 — Cocoa bindings for NSApp

# Utilities
url = "2"                                              # Phase 2 — URL parsing for deep links
```

**What changed from Phase 1:**
- `tauri` gets the `"tray-icon"` feature flag (enables system tray API)
- 3 new plugins: `window-state`, `deep-link`
- 2 new macOS crates: `objc`, `cocoa` (for dock badge)
- 1 new utility: `url` (for parsing deep link URLs)

---

### 2. `src-tauri/tauri.conf.json` (Modified)

The Phase 1 config with tray and deep-link additions.

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/config.schema.json",
  "productName": "InsightPulse",
  "version": "1.1.0",
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
        "transparent": false
      }
    ],
    "security": {
      "dangerousRemoteUrlAccess": [
        {
          "url": "https://choquer.app/**",
          "enableWebAPIs": true
        },
        {
          "url": "https://*.convex.cloud/**",
          "enableWebAPIs": true
        },
        {
          "url": "https://*.convex.site/**",
          "enableWebAPIs": true
        },
        {
          "url": "https://*.vercel-storage.com/**",
          "enableWebAPIs": true
        }
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
      "minimumSystemVersion": "11.0"
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
    }
  }
}
```

**What changed from Phase 1:**
- `version` bumped to `1.1.0`
- Added `app.trayIcon` — points to the template icon, `iconAsTemplate: true` lets macOS auto-handle dark/light mode
- Added `plugins.deep-link` — registers the `insightpulse://` URL scheme in Info.plist at build time

---

### 3. `src-tauri/capabilities/default.json` (Modified)

New permissions for Phase 2 features + remote URL access for Tauri command invocation.

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
    "deep-link:default"
  ]
}
```

**What changed from Phase 1:**
- Added `remote.urls` — **critical**. Since the app loads from `https://choquer.app`, the injected JavaScript needs explicit permission to call Tauri commands (`window.__TAURI__.core.invoke`). Without this, the dock badge sync silently fails.
- Added `window-state:default` and `deep-link:default` permissions

---

### 4. `src-tauri/src/main.rs` (Unchanged)

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    insightpulse_lib::run();
}
```

No changes from Phase 1.

---

### 5. `src-tauri/src/lib.rs` (Modified — central orchestrator)

This is the main file that ties everything together. It registers all modules, plugins, commands, and event handlers.

```rust
mod menu;
mod tray;
mod dock;
mod bridge;
mod deep_link;

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
        // Commands callable from JavaScript
        .invoke_handler(tauri::generate_handler![update_dock_badge])
        // App setup
        .setup(|app| {
            // 1. Build and set the native menu bar
            let menu = menu::build_menu(app)?;
            app.set_menu(menu)?;

            // 2. Set up system tray
            tray::setup_tray(app.handle())?;

            // 3. Set up deep link handler
            deep_link::setup_deep_links(app)?;

            // 4. Configure main window behavior
            let main_window = app
                .get_webview_window("main")
                .expect("main window not found");

            // Hide-on-close: Cmd+W and red X button hide the window, app stays in tray
            let window_for_close = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            // Inject JS bridge on every page load (desktop detection + dock badge sync)
            let window_for_bridge = main_window.clone();
            main_window.on_page_load(move |_webview, payload| {
                if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                    bridge::inject_all(&window_for_bridge);
                }
            });

            // External link interception (carried over from Phase 1)
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
        // Menu event handler (navigation shortcuts, about dialog, etc.)
        .on_menu_event(menu::handle_menu_event)
        .run(tauri::generate_context!())
        .expect("error while running InsightPulse");
}
```

**Key changes from Phase 1:**
- Declares 5 new modules (`menu`, `tray`, `dock`, `bridge`, `deep_link`)
- Registers 3 plugins (opener + window-state + deep-link)
- Registers `update_dock_badge` Tauri command
- Setup function expanded: menu bar, tray, deep links, hide-on-close, JS bridge injection, external link interception
- Menu event handler registered via `.on_menu_event()`

---

### 6. `src-tauri/src/menu.rs` (New — Menu Bar)

Full macOS menu bar with standard menus and Cmd+1-6 navigation.

```rust
use tauri::menu::{
    Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{App, AppHandle, Manager, Wry};

/// Build the complete macOS menu bar
pub fn build_menu(app: &App) -> tauri::Result<Menu<Wry>> {
    // ── InsightPulse menu ──
    let app_submenu = SubmenuBuilder::new(app, "InsightPulse")
        .item(&MenuItemBuilder::with_id("about", "About InsightPulse").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("preferences", "Preferences...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("check_updates", "Check for Updates...")
                .enabled(false) // Placeholder — wired up in Phase 4
                .build(app)?,
        )
        .separator()
        .items(&[
            &PredefinedMenuItem::hide(app, Some("Hide InsightPulse"))?,
            &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
            &PredefinedMenuItem::show_all(app, Some("Show All"))?,
        ])
        .separator()
        .quit()
        .build()?;

    // ── File menu ──
    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("close_window", "Close Window")
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .build()?;

    // ── Edit menu ──
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

    // ── View menu (navigation shortcuts) ──
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

    // ── Window menu ──
    let window_submenu = SubmenuBuilder::new(app, "Window")
        .items(&[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
        ])
        .separator()
        .item(&PredefinedMenuItem::bring_all_to_front(app, None)?)
        .build()?;

    // Assemble the full menu bar
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

        // About dialog
        "about" => {
            if let Some(w) = app_handle.get_webview_window("main") {
                let version = app_handle.package_info().version.to_string();
                let _ = w.eval(&format!(
                    "alert('InsightPulse Desktop v{}\\n\\nChoquer Agency\\'s internal portal.\\nPowered by Tauri v2.')",
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
```

**Menu structure:**

```
InsightPulse
  About InsightPulse
  ─────────────────
  Preferences...          Cmd+,     → navigates to /admin/settings
  Check for Updates...              (disabled — Phase 4)
  ─────────────────
  Hide InsightPulse       Cmd+H
  Hide Others          Cmd+Opt+H
  Show All
  ─────────────────
  Quit InsightPulse       Cmd+Q

File
  Close Window            Cmd+W     → hides window (doesn't quit)

Edit
  Undo                    Cmd+Z
  Redo                 Cmd+Shift+Z
  Cut                     Cmd+X
  Copy                    Cmd+C
  Paste                   Cmd+V
  Select All              Cmd+A

View
  Reload                  Cmd+R
  ─────────────────
  Home                    Cmd+1     → /admin
  CRM                     Cmd+2     → /admin/crm
  Tickets                 Cmd+3     → /admin/tickets
  Reports                 Cmd+4     → /admin/reports
  Timesheet               Cmd+5     → /admin/timesheet
  Settings                Cmd+6     → /admin/settings

Window
  Minimize                Cmd+M
  Zoom
  ─────────────────
  Bring All to Front
```

**No conflict with Cmd+K:** The web app's `KeyboardShortcutProvider` handles Cmd+K for the command palette. Since Cmd+K is not registered as a native menu accelerator, the webview receives it as a regular keyboard event. Cmd+1-6 are captured by the native menu before reaching the webview — this is intentional.

**Edit menu uses PredefinedMenuItem:** These are macOS-native items that WKWebView already handles. Without the Edit menu, Cmd+C/V still work, but there would be no visible menu items, which feels wrong on macOS.

**"Check for Updates..." is disabled:** The menu item exists but is grayed out. In Phase 4, it gets wired to `tauri-plugin-updater`. Including it now establishes the menu structure without needing to restructure later.

---

### 7. `src-tauri/src/tray.rs` (New — System Tray)

System tray icon with full navigation context menu.

```rust
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

/// Set up the system tray icon and context menu
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    // Build the right-click context menu
    let show = MenuItemBuilder::with_id("tray_show", "Show InsightPulse").build(app)?;
    let home = MenuItemBuilder::with_id("tray_home", "Home").build(app)?;
    let crm = MenuItemBuilder::with_id("tray_crm", "CRM").build(app)?;
    let tickets = MenuItemBuilder::with_id("tray_tickets", "Tickets").build(app)?;
    let reports = MenuItemBuilder::with_id("tray_reports", "Reports").build(app)?;
    let timesheet = MenuItemBuilder::with_id("tray_timesheet", "Timesheet").build(app)?;
    let quit = MenuItemBuilder::with_id("tray_quit", "Quit InsightPulse").build(app)?;

    let tray_menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&home)
        .item(&crm)
        .item(&tickets)
        .item(&reports)
        .item(&timesheet)
        .separator()
        .item(&quit)
        .build()?;

    // Build the tray icon
    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .icon_as_template(true) // macOS auto-handles dark/light mode
        .menu(&tray_menu)
        .menu_on_left_click(false) // left-click = show window, right-click = menu
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
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "tray_show" => show_and_focus(app),
                "tray_home" => show_and_navigate(app, "/admin"),
                "tray_crm" => show_and_navigate(app, "/admin/crm"),
                "tray_tickets" => show_and_navigate(app, "/admin/tickets"),
                "tray_reports" => show_and_navigate(app, "/admin/reports"),
                "tray_timesheet" => show_and_navigate(app, "/admin/timesheet"),
                "tray_quit" => app.exit(0),
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

/// Show and focus the main window
fn show_and_focus(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Show the window, focus it, and navigate to a path
fn show_and_navigate(app: &AppHandle, path: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.eval(&format!("window.location.href = '{}'", path));
    }
}
```

**Right-click context menu:**

```
Show InsightPulse
─────────────────
Home
CRM
Tickets
Reports
Timesheet
─────────────────
Quit InsightPulse
```

**Tray icon behavior:**
- **Left-click** — shows and focuses the main window (no menu)
- **Right-click** — opens the context menu
- `iconAsTemplate: true` — macOS automatically renders the icon in the correct color for the current menu bar appearance (dark/light)

**Quit from tray:** `app.exit(0)` fully terminates the process, bypassing the hide-on-close handler. This is the only way to quit besides Cmd+Q.

---

### 8. `src-tauri/src/dock.rs` (New — Dock Badge)

Sets the dock icon badge label using Objective-C FFI.

```rust
/// Set the dock icon badge label (unread notification count)
#[cfg(target_os = "macos")]
pub fn set_dock_badge(count: u32) {
    use cocoa::appkit::NSApp;
    use cocoa::base::nil;
    use cocoa::foundation::NSString;
    use objc::*;

    unsafe {
        let app = NSApp();
        let dock_tile: *mut objc::runtime::Object = msg_send![app, dockTile];

        let label = if count == 0 {
            // Empty string clears the badge
            NSString::alloc(nil).init_str("")
        } else if count > 99 {
            // Cap at 99+ (matches web app behavior)
            NSString::alloc(nil).init_str("99+")
        } else {
            NSString::alloc(nil).init_str(&count.to_string())
        };

        let _: () = msg_send![dock_tile, setBadgeLabel: label];
    }
}

/// No-op on non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub fn set_dock_badge(_count: u32) {}
```

**How it works:**
- `NSApp()` gets the shared `NSApplication` instance
- `dockTile` returns the `NSDockTile` object for the app's dock icon
- `setBadgeLabel:` sets the text displayed on the badge overlay
- Empty string (`""`) clears the badge entirely
- Count is capped at `99+` to match the web app's `NotificationBell` behavior

**Safety:** The `unsafe` block is required for Objective-C FFI. The calls are safe in practice — `NSApp()` and `dockTile` are always available when a macOS app is running. The `msg_send!` macro is the standard way to call Objective-C methods from Rust.

**When the badge updates:**
- Every 30 seconds (piggybacking on the existing notification poll)
- On `notificationChange` events (when user reads/dismisses notifications)
- Count 0 → badge disappears
- App quits → badge disappears automatically (macOS behavior)

---

### 9. `src-tauri/src/bridge.rs` (New — JavaScript Injection)

Injects JavaScript into the webview for desktop detection and dock badge synchronization.

```rust
use tauri::WebviewWindow;

/// Inject all bridge scripts into the webview after page load
pub fn inject_all(webview: &WebviewWindow) {
    inject_desktop_detection(webview);
    inject_dock_badge_sync(webview);
}

/// Set window.insightpulse for feature detection in the web app
fn inject_desktop_detection(webview: &WebviewWindow) {
    let _ = webview.eval(
        r#"
        (function() {
            if (window.insightpulse) return; // already injected
            window.insightpulse = {
                isDesktop: true,
                platform: 'macos'
            };
        })();
        "#,
    );
}

/// Intercept the existing notification count fetch to sync the dock badge
fn inject_dock_badge_sync(webview: &WebviewWindow) {
    let _ = webview.eval(
        r#"
        (function() {
            if (window.__insightpulseBadgeSync) return; // already injected
            window.__insightpulseBadgeSync = true;

            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const response = await originalFetch.apply(this, args);

                // Intercept notification count responses
                try {
                    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
                    if (url && url.includes('/api/admin/notifications/count')) {
                        const cloned = response.clone();
                        const data = await cloned.json();
                        if (typeof data.unreadCount === 'number') {
                            window.__TAURI__.core.invoke('update_dock_badge', {
                                count: data.unreadCount
                            });
                        }
                    }
                } catch (e) {
                    // Silently ignore — badge is non-critical
                }

                return response;
            };
        })();
        "#,
    );
}
```

**How dock badge sync works (no Next.js changes):**

```
NotificationBell.tsx polls every 30s
  → fetch('/api/admin/notifications/count')
  → our monkey-patched fetch intercepts the response
  → clones the response (so NotificationBell still gets its data)
  → extracts unreadCount from the JSON
  → calls window.__TAURI__.core.invoke('update_dock_badge', { count })
  → Rust receive the command → calls dock::set_dock_badge(count)
  → Objective-C sets NSApp.dockTile.badgeLabel
```

**Why monkey-patch fetch instead of other approaches:**
- DOM scraping (reading the badge element) — fragile, breaks if component structure changes
- Modifying NotificationBell.tsx — requires Next.js code changes, breaks the "zero web changes" principle
- Separate Rust-side poll — requires auth cookie transfer, duplicates infrastructure
- Fetch intercept — stable (the API endpoint path won't change), non-invasive, and the `response.clone()` ensures zero impact on the original consumer

**Guard flags (`window.insightpulse`, `window.__insightpulseBadgeSync`):** The `on_page_load` callback fires on every navigation. Without these guards, the scripts would be injected multiple times (multiple fetch patches would stack). The flags ensure idempotent injection.

**Error handling:** The try/catch around the fetch intercept is intentional. The dock badge is non-critical — if the intercept fails for any reason (auth expired, network error, unexpected response format), the app continues working. The badge just won't update.

---

### 10. `src-tauri/src/deep_link.rs` (New — URL Scheme Handler)

Handles `insightpulse://` URLs to navigate the app directly.

```rust
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
    // Parse: insightpulse://admin/tickets?ticket=CHQ-042
    if let Ok(parsed) = url::Url::parse(raw_url) {
        let path = parsed.path();
        let query = parsed
            .query()
            .map(|q| format!("?{}", q))
            .unwrap_or_default();
        let full_path = format!("{}{}", path, query);

        // Show and focus the window, then navigate
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.eval(&format!("window.location.href = '{}'", full_path));
        }
    }
}
```

**URL mapping:**
| Deep Link | Navigates To |
|-----------|-------------|
| `insightpulse://admin/tickets` | `/admin/tickets` |
| `insightpulse://admin/tickets?ticket=CHQ-042` | `/admin/tickets?ticket=CHQ-042` |
| `insightpulse://admin/crm` | `/admin/crm` |
| `insightpulse://admin/crm/abc123` | `/admin/crm/abc123` |
| `insightpulse://admin/settings` | `/admin/settings` |
| `insightpulse://anything/else` | `/anything/else` (shows Next.js 404) |

**Edge cases:**
- **App not running:** macOS launches the app. `tauri-plugin-deep-link` queues the URL and delivers it once setup is complete.
- **Window hidden:** The handler calls `window.show()` first, then navigates.
- **Invalid path:** Navigates to the path, which shows the Next.js 404 page. No harm done.
- **Security:** Deep links only navigate — they cannot trigger mutations, exports, or deletions. The web app's auth layer protects all API routes regardless of how the user arrived at the page.

**Testing from Terminal:**
```bash
open "insightpulse://admin/tickets"
open "insightpulse://admin/tickets?ticket=CHQ-042"
open "insightpulse://admin/crm"
open "insightpulse://admin/settings"
```

---

### 11. Tray Icon Asset Requirements

The system tray needs a small monochrome icon. macOS menu bar icons have specific requirements.

**Specifications:**
- `tray-icon.png` — 22x22 pixels
- `tray-icon@2x.png` — 44x44 pixels (Retina)
- **Monochrome** — solid black shapes on transparent background
- **Template image** — `iconAsTemplate: true` in config lets macOS auto-colorize for dark/light mode
- **Design** — simplified silhouette of the InsightPulse logo (the "pulse" icon shape). At 22px, use the simplest recognizable shape — a pulse/heartbeat line or a simplified version of the app icon

**Generation approach:**
- Export the app icon (`app/icon.png`) as a silhouette
- Remove all color — make all non-transparent pixels solid black
- Scale to 22x22 and 44x44
- Save as PNG with transparency

**Alternatively:** Use a simple geometric shape that represents the brand — a stylized "IP" monogram or a pulse wave icon. The macOS design guidelines recommend simple, recognizable shapes for menu bar icons.

Place in: `src-tauri/icons/tray-icon.png` and `src-tauri/icons/tray-icon@2x.png`

---

## Implementation Sequence

Features are ordered by dependency — each step builds on the previous.

### Step 1: Window State Memory
**Files:** `Cargo.toml`, `lib.rs`, `capabilities/default.json`
- Add `tauri-plugin-window-state = "2"` to Cargo.toml
- Register `.plugin(tauri_plugin_window_state::Builder::new().build())` in lib.rs
- Add `"window-state:default"` to capabilities
- **Test:** Resize window, quit (Cmd+Q), reopen — same size and position

### Step 2: Menu Bar
**Files:** `menu.rs` (new), `lib.rs`
- Create `menu.rs` with full menu structure
- Call `menu::build_menu(app)` in lib.rs setup
- Register `.on_menu_event(menu::handle_menu_event)` on the builder
- **Test:** All menu items visible, Cmd+1-6 navigate correctly, Cmd+, opens settings, Cmd+R reloads

### Step 3: System Tray + Hide-on-Close
**Files:** `tray.rs` (new), `lib.rs`, `tauri.conf.json`
- Create tray icon assets (22x22 template PNG)
- Add `app.trayIcon` to tauri.conf.json
- Create `tray.rs` with setup function
- Add hide-on-close handler to lib.rs (`on_window_event` → `api.prevent_close()` + `hide()`)
- Override Cmd+W in menu to hide instead of close
- **Test:** Tray icon visible. Left-click shows window. Right-click shows menu with all nav items. Cmd+W hides window. Click tray to bring it back. Cmd+Q still quits.

### Step 4: Dock Badge + JS Bridge
**Files:** `dock.rs` (new), `bridge.rs` (new), `lib.rs`, `Cargo.toml`, `capabilities/default.json`
- Add `objc`, `cocoa` to Cargo.toml
- Create `dock.rs` with `set_dock_badge`
- Create `bridge.rs` with fetch intercept and desktop detection injection
- Register `update_dock_badge` command in lib.rs
- Add `remote.urls` to capabilities (critical for invoke from remote URL)
- Wire `on_page_load` in lib.rs to call `bridge::inject_all`
- **Test:** Log in, wait 30 seconds, dock badge shows unread count. Mark all as read → badge disappears. Create a notification → badge appears on next poll cycle.

### Step 5: Deep Links
**Files:** `deep_link.rs` (new), `lib.rs`, `Cargo.toml`, `tauri.conf.json`
- Add `tauri-plugin-deep-link` and `url` to Cargo.toml
- Add `plugins.deep-link.desktop.schemes` to tauri.conf.json
- Create `deep_link.rs`
- Register plugin and call setup in lib.rs
- **Test:** `open "insightpulse://admin/tickets"` from Terminal → app shows and navigates to Tickets

### Step 6: Integration Testing
- Run through the full verification checklist below
- Test all features working together
- Test edge cases: hide → deep link → show, rapid menu shortcuts, badge after hide/show

---

## Edge Cases & Risk Mitigations

| Scenario | Handling |
|----------|----------|
| **Window hidden + deep link received** | Deep link handler calls `window.show()` then navigates — window reappears at correct page |
| **Window hidden + tray navigation** | Tray handler calls `show_and_navigate()` — same as above |
| **App cold-launched via deep link** | `tauri-plugin-deep-link` queues the URL, delivers it after setup completes |
| **No internet / notification poll fails** | Fetch intercept catches error silently, badge stays at last known count |
| **User not logged in** | `/api/admin/notifications/count` returns 401, no `unreadCount` in response, badge stays at 0 |
| **User logs out** | Next poll returns 401, badge stays stale — acceptable since user is logging out |
| **Multiple rapid Cmd+number presses** | Each triggers `window.location.href` — last one wins, no race condition |
| **Cmd+K (command palette) conflict** | No conflict — Cmd+K is not a native menu accelerator, so the webview receives it normally |
| **Very large notification count** | Capped at "99+" display (same as web app's NotificationBell) |
| **External monitor disconnected** | `tauri-plugin-window-state` checks if saved position is visible, centers window if not |
| **Window state file corrupted** | Plugin gracefully falls back to defaults from tauri.conf.json (1400x900, centered) |
| **Tray icon in dark mode** | `iconAsTemplate: true` — macOS auto-renders in correct color for current appearance |
| **Deep link with special characters** | `url::Url::parse` handles URL encoding. Invalid URLs are silently ignored |
| **fetch monkey-patch stacking** | Guard flag `window.__insightpulseBadgeSync` prevents multiple patches on page navigation |
| **About dialog while window hidden** | About handler calls `window.show()` implicitly via webview reference — no issue |

---

## What This Phase Does NOT Include

These are explicitly deferred:

| Feature | Phase | Why deferred |
|---------|-------|-------------|
| Native push notifications | Phase 3 | Requires NotificationBridge component + Rust handler |
| Code signing & notarization | Phase 4 | Requires Apple Developer Program ($99/year) |
| Auto-updater (wiring "Check for Updates") | Phase 4 | Requires signed builds + update endpoint |
| Offline support | Phase 6 | Waiting for Convex offline story |
| Global keyboard shortcuts (from outside app) | Phase 6 | `tauri-plugin-global-shortcut` |
| Touch ID authentication | Phase 6 | Future consideration |

---

## What This Phase Does NOT Change in the Web App

- **Zero modifications** to any file in `components/`, `app/`, `lib/`, `hooks/`, `convex/`, or `types/`
- **Zero new API routes** — the dock badge piggybacks on the existing notification count endpoint
- **Zero Vercel changes** — the deployment is untouched
- The web app continues to work identically in a browser — `window.insightpulse` only exists in the Tauri webview

---

## Verification Checklist

### Menu Bar
- [ ] "InsightPulse" menu appears in the menu bar with About, Preferences, Hide, Quit
- [ ] "Check for Updates..." is visible but grayed out
- [ ] File menu shows "Close Window" with Cmd+W
- [ ] Edit menu has Undo, Redo, Cut, Copy, Paste, Select All — all working
- [ ] View menu shows Reload + navigation items with Cmd+1-6
- [ ] Cmd+1 navigates to Home (`/admin`)
- [ ] Cmd+2 navigates to CRM (`/admin/crm`)
- [ ] Cmd+3 navigates to Tickets (`/admin/tickets`)
- [ ] Cmd+4 navigates to Reports (`/admin/reports`)
- [ ] Cmd+5 navigates to Timesheet (`/admin/timesheet`)
- [ ] Cmd+6 navigates to Settings (`/admin/settings`)
- [ ] Cmd+, navigates to Settings (`/admin/settings`)
- [ ] Cmd+R reloads the page
- [ ] Cmd+K still opens the command palette (no conflict with native menu)
- [ ] "About InsightPulse" shows version info

### System Tray
- [ ] Tray icon appears in the macOS menu bar area
- [ ] Left-click on tray icon shows and focuses the main window
- [ ] Right-click shows context menu: Show, Home, CRM, Tickets, Reports, Timesheet, Quit
- [ ] Each navigation item shows the window and navigates to the correct page
- [ ] "Quit InsightPulse" fully exits the app (tray icon disappears)
- [ ] Tray icon renders correctly in both light and dark menu bar modes

### Hide-on-Close
- [ ] Cmd+W hides the window (does NOT quit the app)
- [ ] Red close button (X) hides the window (does NOT quit the app)
- [ ] After hiding, tray icon is still visible in menu bar
- [ ] Left-click tray icon → window reappears at the same page
- [ ] Cmd+Q still fully quits the app
- [ ] Tray right-click → Quit still fully quits the app

### Dock Badge
- [ ] After login, wait 30 seconds — dock badge shows unread notification count
- [ ] If no unread notifications, no badge is shown
- [ ] Mark all notifications as read → badge disappears within 30 seconds
- [ ] Create a new notification (assign a ticket) → badge appears within 30 seconds
- [ ] Badge shows "99+" for counts above 99
- [ ] Badge updates while window is hidden (tray still running)

### Window State Memory
- [ ] Resize the window to a custom size and position
- [ ] Quit the app (Cmd+Q)
- [ ] Reopen — window appears at the exact same size and position
- [ ] Maximize the window, quit, reopen — still maximized
- [ ] Move window to a second monitor, quit, reopen — appears on the same monitor
- [ ] If the saved monitor is disconnected, window centers on the primary display

### Deep Links
- [ ] `open "insightpulse://admin/tickets"` from Terminal → app shows Tickets page
- [ ] `open "insightpulse://admin/crm"` → app shows CRM page
- [ ] `open "insightpulse://admin/tickets?ticket=CHQ-042"` → navigates with query params
- [ ] Deep link while app is hidden → window shows and navigates
- [ ] Deep link while app is not running → app launches and navigates after setup
- [ ] Invalid path (`insightpulse://invalid/path`) → shows Next.js 404 page

### Desktop Detection
- [ ] Open browser console in the Tauri webview (View > Developer Tools or right-click > Inspect)
- [ ] `window.insightpulse` returns `{ isDesktop: true, platform: 'macos' }`
- [ ] In a regular browser, `window.insightpulse` is `undefined`

### Integration
- [ ] All Phase 1 functionality still works (login, navigation, real-time, file uploads/downloads, external links)
- [ ] Cmd+W → tray click → Cmd+3 → Cmd+W → deep link → Cmd+Q (full lifecycle)
- [ ] No console errors related to Tauri in the webview developer tools

---

## Estimated Output

After Phase 2 is complete:

- **5 new Rust files** (`menu.rs`, `tray.rs`, `dock.rs`, `bridge.rs`, `deep_link.rs`)
- **2 new icon assets** (`tray-icon.png`, `tray-icon@2x.png`)
- **3 modified files** (`Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `lib.rs`) — wait, that's 4
- **4 modified files** (`Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `lib.rs`)
- **0 changes** to the existing Next.js app, Convex backend, or Vercel config
- The app now feels like a native macOS application — not just a web page in a window
