# InsightPulse Desktop App — Phase 1: Tauri Shell

## Goal

A working `.app` that opens InsightPulse (`https://choquer.app`) in a native macOS window. All existing functionality — login, navigation, Convex real-time, TipTap editor, file uploads, file downloads — works identically to the browser experience. No backend changes required.

---

## What This Phase Delivers

- A native macOS `.app` file you can double-click to open InsightPulse
- Loads the live Vercel-hosted app (no self-hosting)
- In dev mode, loads `http://localhost:3388` (your local Next.js server)
- Cookie-based auth persists across app restarts
- External links (Google Analytics, Slack, client websites) open in your system browser
- File downloads (ticket attachments) save via native macOS save dialog
- File uploads work via native macOS file picker
- Convex WebSocket connections work (real-time updates)

---

## Prerequisites — One-Time Setup

You've never used Rust or Tauri before, so here's the full setup. This only needs to happen once.

### Step 1: Xcode Command Line Tools
```bash
xcode-select --install
```
If already installed, this will say so. These provide the C/C++ compilers Rust needs.

### Step 2: Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
- When prompted, choose **option 1 (default installation)**
- After it finishes, restart your terminal or run: `source $HOME/.cargo/env`
- Verify: `rustc --version` should print something like `rustc 1.XX.X`

### Step 3: Install Tauri CLI
```bash
cargo install tauri-cli@^2
```
This takes 2-5 minutes on first install (it compiles from source). Subsequent runs are instant.

### Step 4: Verify Everything
```bash
rustc --version     # Should show 1.XX.X
cargo --version     # Should show 1.XX.X
cargo tauri --version  # Should show 2.X.X
```

---

## Project Structure

All Tauri files live inside `insightpulse/src-tauri/`. The existing Next.js codebase is untouched.

```
insightpulse/
├── src-tauri/                    # NEW — Tauri desktop app
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # App config (window, URLs, security, bundle)
│   ├── capabilities/
│   │   └── default.json          # Permission declarations
│   ├── src/
│   │   ├── main.rs               # Rust entry point (2 lines — just calls lib)
│   │   └── lib.rs                # Tauri app builder + external link handler
│   └── icons/                    # App icons (generated from existing icon.png)
│       ├── icon.icns             # macOS app icon
│       ├── icon.ico              # Windows (for completeness)
│       ├── icon.png              # Base PNG
│       ├── 32x32.png
│       ├── 128x128.png
│       ├── 128x128@2x.png
│       └── Square*               # Various sizes
├── package.json                  # MODIFIED — add tauri:dev and tauri:build scripts
├── app/icon.png                  # EXISTING — source for icon generation
└── (everything else unchanged)
```

---

## File-by-File Specification

### 1. `src-tauri/Cargo.toml`

Rust's equivalent of `package.json`. Declares the app metadata and dependencies.

```toml
[package]
name = "insightpulse"
version = "1.0.0"
edition = "2021"

[lib]
name = "insightpulse_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"            # Opens external links in system browser
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Why each dependency:**
- `tauri` — the framework itself
- `tauri-plugin-opener` — lets us intercept external links and open them in Safari/Chrome instead of the WebView
- `serde` / `serde_json` — Rust's standard JSON serialization (required by Tauri internals)

### 2. `src-tauri/tauri.conf.json`

The central config file. Controls the window, security, bundling, and URL loading.

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
    }
  }
}
```

**Key decisions explained:**

| Config | Value | Why |
|--------|-------|-----|
| `identifier` | `agency.choquer.insightpulse` | Reverse-domain format — required for macOS app signing and uniqueness |
| `devUrl` | `http://localhost:3388` | Loads your local Next.js dev server during development |
| `frontendDist` | `https://choquer.app` | In production builds, loads the live Vercel app (no bundling needed) |
| `dangerousRemoteUrlAccess` | 4 domains | Whitelists the domains the WebView is allowed to load content from |
| `enableWebAPIs` | `true` | Enables WebSocket, fetch, localStorage — needed for Convex real-time |
| `minWidth/minHeight` | 1024x700 | Prevents the window from being resized too small for the admin layout |
| `minimumSystemVersion` | `11.0` | Big Sur — covers all 2020+ Intel iMacs and all Apple Silicon Macs |

**Domain whitelist breakdown:**
- `choquer.app` — the app itself
- `*.convex.cloud` — Convex database queries and WebSocket subscriptions
- `*.convex.site` — Convex HTTP actions (file serving, webhooks)
- `*.vercel-storage.com` — Vercel Blob (uploaded ticket attachments, profile pics)

### 3. `src-tauri/capabilities/default.json`

Declares what permissions the app needs. Tauri v2 uses a capability-based security model.

```json
{
  "$schema": "https://raw.githubusercontent.com/nicegui/nicegui/refs/heads/main/nicegui/static/tauri/capabilities-schema.json",
  "identifier": "default",
  "description": "Default capabilities for InsightPulse desktop app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default"
  ]
}
```

**What each permission allows:**
- `core:default` — basic window management (close, minimize, resize, focus)
- `opener:default` — opening URLs in the system browser

### 4. `src-tauri/src/main.rs`

The Rust entry point. Standard boilerplate — just calls into `lib.rs`.

```rust
// Prevents an extra console window on Windows (not relevant for macOS, but standard practice)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    insightpulse_lib::run();
}
```

### 5. `src-tauri/src/lib.rs`

The Tauri app builder. This is where we configure the app behavior.

```rust
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Intercept navigation to external URLs — open in system browser
            let main_window = app.get_webview_window("main")
                .expect("main window not found");

            main_window.on_navigation(move |url| {
                let url_str = url.as_str();

                // Allow the app's own URLs and required service domains
                let allowed_domains = [
                    "choquer.app",
                    "convex.cloud",
                    "convex.site",
                    "vercel-storage.com",
                    "localhost",
                ];

                let is_allowed = allowed_domains.iter().any(|domain| {
                    url.host_str().map_or(false, |h| h == *domain || h.ends_with(&format!(".{}", domain)))
                });

                if is_allowed {
                    true // Allow navigation in the WebView
                } else {
                    // Open external URLs in the system browser
                    let _ = open::that(url_str);
                    false // Block navigation in the WebView
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running InsightPulse");
}
```

**What this does:**
- Initializes the opener plugin for system browser integration
- Sets up a navigation interceptor on the main window
- Any URL going to `choquer.app`, `convex.cloud`, `convex.site`, `vercel-storage.com`, or `localhost` loads inside the app
- Any other URL (Google Analytics, Slack, client websites, etc.) opens in your default system browser instead
- This is the key behavior difference from a regular browser — external links don't hijack your app window

### 6. `src-tauri/src/build.rs`

Required build script for Tauri (standard boilerplate).

```rust
fn main() {
    tauri_build::build();
}
```

### 7. `src-tauri/icons/`

Generated from the existing `app/icon.png` (192x192). Tauri provides a CLI command to generate all required sizes:

```bash
cd insightpulse
cargo tauri icon app/icon.png
```

This auto-generates all the required sizes into `src-tauri/icons/`:
- `32x32.png`, `128x128.png`, `128x128@2x.png`
- `icon.icns` (macOS app icon bundle)
- `icon.ico` (Windows — generated for completeness)
- Various `Square` sizes for different contexts

### 8. `package.json` changes

Add two scripts to the existing `package.json`:

```json
{
  "scripts": {
    "dev": "next dev -p 3388",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "tauri:dev": "cargo tauri dev",
    "tauri:build": "cargo tauri build"
  }
}
```

---

## How the App Works (Technical Flow)

### Development Mode
```
Terminal 1: npm run dev          → Next.js on localhost:3388
Terminal 2: npm run tauri:dev    → Tauri opens a native window pointing at localhost:3388
```

Tauri's dev mode has **hot-reload** — when you save a file in Next.js, the WebView refreshes automatically (same as a browser). The Rust side also hot-reloads if you change Rust files (though you won't need to in Phase 1).

### Production Mode
```
npm run tauri:build    → Compiles to insightpulse/src-tauri/target/release/bundle/
                         Produces: InsightPulse.app + InsightPulse.dmg
```

The production app loads `https://choquer.app` directly — no local server needed.

### Authentication Flow
1. User opens the app → WebView loads `https://choquer.app/admin`
2. Admin layout checks the `insightpulse_admin` cookie → no cookie → shows login form
3. User logs in → cookie is set in WKWebView's `WKWebsiteDataStore.default()`
4. Cookie persists across app restarts (WKWebView's default behavior on macOS)
5. Next launch → cookie exists → user goes straight to the admin portal

**No changes needed** — the existing cookie auth works automatically in WKWebView.

### File Downloads (Ticket Attachments)
WKWebView on macOS handles downloads natively:
- When a user clicks a download link (e.g., a ticket attachment URL from Vercel Blob), macOS presents a native save dialog
- The file saves to the user's chosen location (defaults to Downloads)
- No additional Tauri code needed for Phase 1 — WKWebView handles this out of the box

### File Uploads (Ticket Attachments, Profile Pics)
WKWebView supports `<input type="file">` natively:
- Clicking a file input opens the native macOS file picker (Finder-style dialog)
- Selected files are sent to the Vercel upload endpoint as normal
- Drag-and-drop from Finder into the WebView also works by default in WKWebView
- No additional Tauri code needed for Phase 1

### Convex Real-Time (WebSockets)
- Convex connects via WSS (WebSocket Secure) to `*.convex.cloud`
- WKWebView fully supports WebSockets
- The `dangerousRemoteUrlAccess` whitelist allows the connection
- Real-time subscriptions (tickets, notifications, etc.) work identically to the browser

### External Links
- User clicks a link to `https://analytics.google.com` or `https://slack.com/...`
- The `on_navigation` handler in `lib.rs` detects it's not an allowed domain
- Opens the URL in the system browser (Safari/Chrome)
- The Tauri window stays on the current page

---

## Edge Cases & How They're Handled

| Scenario | Behavior | Why |
|----------|----------|-----|
| **No internet connection** | WebView shows standard "cannot connect" error | Same as browser — the app requires internet since it loads from Vercel |
| **Vercel is down** | WebView shows error page | Rare, but same as browser. No offline mode in Phase 1 |
| **Cookie expires or is cleared** | User sees login screen on next navigation | Same as browser — re-login and cookie is re-set |
| **macOS dark mode** | App renders as the web app does (your CSS controls this) | WKWebView inherits nothing from system appearance unless your CSS uses `prefers-color-scheme` |
| **Retina / non-Retina displays** | WKWebView auto-handles pixel density | Same as Safari — fonts and images render at native resolution |
| **Multiple monitors** | Window can be dragged between monitors | Standard macOS window behavior, handled by Tauri |
| **Cmd+Q** | Quits the app | Standard macOS behavior, Tauri handles this by default |
| **Cmd+W** | Closes the window (app quits since there's only one window) | Default Tauri behavior for single-window apps |
| **Cmd+R** | Reloads the page | WKWebView handles this natively |
| **Cmd+C / Cmd+V** | Copy/paste works | WKWebView inherits standard macOS text handling |
| **Cmd+F** | Browser-style find-in-page | WKWebView supports this natively |
| **Pinch to zoom** | Zooms the page | WKWebView default behavior |
| **Back/Forward swipe** | No effect (single-page app navigation) | The web app handles its own routing |
| **Print (Cmd+P)** | macOS print dialog for current page | WKWebView supports this |
| **TipTap rich text editor** | Works as-is | WKWebView supports all the Web APIs TipTap needs (contentEditable, Selection, Range, etc.) |
| **Recharts / Canvas** | Works as-is | WKWebView supports Canvas and SVG |
| **First launch after build (unsigned)** | macOS shows "app from unidentified developer" warning | Expected in Phase 1 — right-click > Open bypasses this. Code signing comes in Phase 4 |

---

## What This Phase Does NOT Include

These are explicitly deferred to later phases:

| Feature | Phase | Why deferred |
|---------|-------|-------------|
| macOS menu bar customization | Phase 2 | Not needed for a working app |
| System tray icon | Phase 2 | Not needed for a working app |
| Dock badge (unread count) | Phase 2 | Requires notification infrastructure |
| Window position memory | Phase 2 | Nice-to-have, not critical |
| Deep links (`insightpulse://...`) | Phase 2 | Requires URL scheme registration |
| Native push notifications | Phase 3 | Requires Rust notification handler + frontend bridge |
| Code signing & notarization | Phase 4 | Requires Apple Developer Program ($99/year) |
| Auto-updater | Phase 4 | Requires signed builds + update server |
| DMG distribution | Phase 4 | Requires signing for Gatekeeper |
| Offline support | Phase 6 | Waiting for Convex offline story |

---

## Development Workflow

### First Time Setup (Once)
```bash
# 1. Install prerequisites (see Prerequisites section above)
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
cargo install tauri-cli@^2

# 2. Generate icons
cd insightpulse
cargo tauri icon app/icon.png

# 3. First build (slow — compiles all Rust deps, ~3-5 min)
npm run tauri:dev
```

### Daily Development
```bash
# Terminal 1 — Next.js dev server
cd insightpulse
npm run dev

# Terminal 2 — Tauri desktop window
cd insightpulse
npm run tauri:dev
```

The Tauri window opens automatically. Edit your Next.js code as normal — the window refreshes on save.

### Building the .app
```bash
cd insightpulse
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/macos/InsightPulse.app`

You can drag this `.app` to your Applications folder and run it. Note: without code signing (Phase 4), macOS will show a warning on first launch — right-click > Open to bypass.

---

## Verification Checklist

After Phase 1 is built, test every item:

### Core Functionality
- [ ] `npm run dev` + `npm run tauri:dev` → app window opens showing InsightPulse
- [ ] Login works — enter credentials, cookie is set, admin portal loads
- [ ] Close app and reopen — still logged in (cookie persisted)
- [ ] All admin pages load: Tickets, CRM, Projects, Clients, Settings, Timesheet, Service Board, Reports
- [ ] Page navigation works (clicking sidebar links, breadcrumbs, etc.)

### Real-Time (Convex)
- [ ] Open the same page in both Tauri app and a browser
- [ ] Change a ticket status in the browser → Tauri app updates within 1-2 seconds
- [ ] Create a new ticket in Tauri → appears in browser immediately
- [ ] Notification bell updates when a new notification is created

### Rich Content
- [ ] TipTap editor loads on ticket detail pages
- [ ] Can type, format (bold, italic, lists), and save rich text
- [ ] Recharts graphs render on dashboard/reports pages
- [ ] Images display correctly (profile pics, uploaded attachments)

### File Operations
- [ ] Click a ticket attachment link → file downloads (native save dialog or auto-download to Downloads)
- [ ] Upload a file to a ticket → native macOS file picker opens, upload succeeds
- [ ] Drag a file from Finder onto an upload area → upload works (if drag-and-drop is supported in the web UI)

### External Links
- [ ] Click a link to an external site (e.g., client website, Google Analytics) → opens in system browser, NOT in the Tauri window
- [ ] The Tauri window stays on its current page after an external link opens

### Window Behavior
- [ ] Window resizes smoothly, respects min size (1024x700)
- [ ] App opens centered on screen
- [ ] Cmd+Q quits the app
- [ ] Cmd+W closes the window
- [ ] Cmd+C / Cmd+V copy/paste works in text fields and TipTap
- [ ] Cmd+R reloads the page
- [ ] Scrolling works smoothly (trackpad and mouse wheel)
- [ ] Window title shows "InsightPulse"

### Production Build
- [ ] `npm run tauri:build` completes without errors
- [ ] `InsightPulse.app` exists in `src-tauri/target/release/bundle/macos/`
- [ ] Double-clicking the `.app` opens the app (after bypassing Gatekeeper with right-click > Open)
- [ ] Production app loads `https://choquer.app` (not localhost)
- [ ] All the above checks pass in the production build

---

## Risks & Mitigations (Phase 1 Specific)

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| WKWebView cookie not persisting | Low | WKWebView uses `WKWebsiteDataStore.default()` which persists by default. If this fails, we add `tauri-plugin-store` in a patch to manually persist the auth token |
| Convex WebSocket blocked | Very Low | WSS connections work in WKWebView. The `dangerousRemoteUrlAccess` whitelist covers `*.convex.cloud`. If issues arise, check macOS Console.app for ATS errors |
| TipTap editor quirks in WKWebView | Low | WKWebView is essentially Safari's engine. TipTap officially supports Safari. If edge cases appear, they'll be CSS/selection quirks, not blockers |
| First Rust compile is slow | Certain | First `cargo tauri dev` takes 3-5 minutes (compiling all dependencies). Subsequent runs are fast (~5 seconds). This is normal Rust behavior |
| "Unidentified developer" warning | Certain | Expected without code signing. Right-click > Open bypasses it. Proper fix in Phase 4 |
| Vercel Blob URLs not loading | Low | `*.vercel-storage.com` is whitelisted. If Vercel changes their CDN domain, update the whitelist |
| File download doesn't trigger save dialog | Medium | WKWebView download behavior can vary by macOS version. If downloads don't work, we add a Tauri download handler command in a patch |

---

## Estimated Output

After Phase 1 is complete, you'll have:

- **8 new files** (all inside `src-tauri/`) + icon assets
- **1 modified file** (`package.json` — two new scripts)
- **0 changes** to the existing Next.js app, Convex backend, or Vercel config
- **~10-15 MB** `.app` file (vs ~150 MB if we'd used Electron)
- A desktop app that is functionally identical to opening `https://choquer.app` in Safari, but in its own dedicated window with its own dock icon
