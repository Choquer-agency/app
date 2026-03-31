# InsightPulse macOS Desktop App — Phased Build Plan

## Context

Choquer Agency's ERP/CRM (InsightPulse) is currently a Next.js 16 web app hosted on Vercel. The team wants to migrate it into a native macOS desktop application that team members can download and install. The team uses Macs ranging from 2020 Intel iMacs to the latest Apple Silicon MacBook Pros. The two core requirements are: (1) 100% real-time data via Convex, and (2) native macOS push notifications.

**Approach: Tauri v2** — wraps the existing Vercel-hosted web app in a native macOS WebView (WKWebView), adding native capabilities (notifications, dock badge, system tray, auto-updater) via a lightweight Rust backend. The app loads `https://app.choquer.agency` — no need to bundle or self-host Next.js. This means zero changes to the existing backend, cron jobs, or Convex setup for Phase 1.

**Why Tauri v2 over Electron:**
- ~10-15MB DMG vs Electron's ~150MB
- Uses native WKWebView (Apple's own web engine) — better performance, lower memory
- Native macOS APIs via Rust (notifications, dock, menu bar)
- Built-in auto-updater and code signing support
- Tauri v2 has iOS/Android support for future mobile phases

---

## Phase Dependency Graph

```
Phase 1 (Shell) ──→ Phase 2 (Native macOS) ──→ Phase 3 (Notifications)
                              │                          │
                              └──→ Phase 4 (Distribution) ←──┘
                                          │
                                    [Shippable v1.0]
                                          │
                                   Phase 5 (Real-Time)
                                          │
                                   Phase 6 (Future)
```

Phases 1-4 = shippable v1.0 desktop app. Phase 5 = experience upgrade. Phase 6 = future roadmap.

---

## Phase 1: Tauri Shell — Working Desktop App

**Goal:** A `.app` that opens InsightPulse in a native macOS window. All existing functionality works as-is.

### What gets built
- Tauri v2 project scaffolded at `insightpulse/src-tauri/`
- Rust entry point loading the production Vercel URL (dev mode: `localhost:3388`)
- Window config: 1400x900, min 1024x700, resizable, centered
- App icons generated from existing branding

### Key files to create
```
insightpulse/src-tauri/
  src/main.rs              # Rust entry point
  src/lib.rs               # Tauri builder setup
  Cargo.toml               # Rust deps (tauri v2)
  tauri.conf.json          # App config, window, security
  capabilities/default.json # Permission capabilities
  icons/                   # Generated from existing icon.png
```

### Technical details
- `tauri.conf.json` → `build.devUrl: "http://localhost:3388"`, `build.frontendDist: "https://app.choquer.agency"`
- `dangerousRemoteUrlAccess` must whitelist `https://app.choquer.agency/**` and `https://*.convex.cloud/**`
- `bundle.macOS.minimumSystemVersion: "11.0"` (Big Sur — covers all 2020+ Macs)
- Cookie-based auth works automatically — WKWebView persists cookies via `WKWebsiteDataStore.default()`
- `X-Frame-Options: DENY` in `next.config.ts` does NOT affect Tauri (it's a WebView, not an iframe)
- Add `tauri:dev` and `tauri:build` scripts to `package.json`

### Prerequisites
- Rust toolchain (`rustup`)
- Tauri CLI (`cargo install tauri-cli@^2`)
- Xcode Command Line Tools

### Verification
1. Run `npm run dev` + `npm run tauri:dev` — app window opens at localhost
2. Login works, cookie persists after close/reopen
3. All pages navigate correctly (tickets, CRM, timesheet, settings)
4. Convex real-time works (change ticket in browser → updates in Tauri app)
5. TipTap editor works in WKWebView

---

## Phase 2: Native macOS Feel

**Goal:** The app feels like a real Mac app — menu bar, system tray, dock badge, window memory, keyboard shortcuts.

### What gets built

| Feature | File | Details |
|---------|------|---------|
| **Menu bar** | `src/menu.rs` | Standard macOS menus (File, Edit, View, Window) + custom nav shortcuts (Cmd+T → Tickets, etc.) |
| **System tray** | `src/tray.rs` | Tray icon in menu bar area. Left-click = focus app. Right-click = context menu (Open, Quit) |
| **Dock badge** | `src/dock.rs` | Unread notification count on dock icon via `objc` crate → `NSApp.dockTile.badgeLabel` |
| **Window state** | `tauri-plugin-window-state` | Remembers size/position across restarts |
| **Deep links** | `tauri-plugin-deep-link` | `insightpulse://admin/tickets?ticket=CHQ-042` opens directly |

### Key dependencies (Cargo.toml)
```toml
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-window-state = "2"
tauri-plugin-deep-link = "2"
objc = "0.2"
cocoa = "0.26"
```

### Frontend changes (minimal)
- Inject `window.insightpulse = { isDesktop: true }` via `webview.eval()` on page load for feature detection

### Verification
1. Menu bar shows "InsightPulse" with standard macOS menus + custom shortcuts
2. Cmd+Q quits, Cmd+W closes, Cmd+M minimizes
3. Tray icon appears in menu bar, right-click shows context menu
4. Window position remembered after restart
5. `insightpulse://admin/tickets` opens app from Terminal

---

## Phase 3: Native Push Notifications

**Goal:** Convex notifications appear as native macOS notifications instantly — even when the window is minimized/hidden.

### Architecture
The existing `convex/notifications.ts` already has a `listByRecipient` query. We subscribe to it via Convex `useQuery` in the WebView, and when new notifications arrive, we call a Tauri Rust command to show a native macOS notification.

### What gets built

**Frontend — NotificationBridge component** (`components/NotificationBridge.tsx`):
- `"use client"` component rendering nothing visually
- Uses `useQuery(api.notifications.listByRecipient, { recipientId, limit: 5 })` — Convex real-time subscription
- Tracks previously-seen notification IDs via `useRef`
- On new notification: calls `window.__TAURI__.core.invoke('show_notification', { title, body, link })`
- Only activates when `window.__TAURI__` is detected (no-op in browser)
- Added to `app/admin/layout.tsx` inside the authenticated branch

**Rust — Notification handler** (`src/notifications.rs`):
- `show_notification` Tauri command using `tauri-plugin-notification`
- Shows native macOS notification with title + body
- On notification click: navigates WebView to the `link` URL via `webview.eval()`
- Updates dock badge count

**Rust deps**: `tauri-plugin-notification = "2"`

### Files to create/modify
- NEW: `components/NotificationBridge.tsx`
- MODIFY: `app/admin/layout.tsx` — add `<NotificationBridge recipientId={session.teamMemberId} />`
- NEW: `src-tauri/src/notifications.rs`
- MODIFY: `src-tauri/src/lib.rs` — register `show_notification` command
- MODIFY: `src-tauri/Cargo.toml` — add notification plugin

### Critical: macOS Notification Permissions
- macOS requires user permission to show notifications
- Tauri's notification plugin handles the permission prompt automatically on first use
- The app's `Info.plist` (generated by Tauri) includes `NSUserNotificationAlertStyle = alert`

### Verification
1. User A in Tauri app, User B in browser — B assigns ticket to A
2. A sees native macOS notification within 1-2 seconds
3. Click notification → app focuses and navigates to the ticket
4. Dock badge shows unread count
5. Close window (tray still running) → notifications still appear

---

## Phase 4: Distribution & Auto-Updates

**Goal:** Team members download a DMG, install, and the app auto-updates when new versions ship.

### 4A. Code Signing & Notarization
- Requires Apple Developer Program ($99/year)
- Developer ID Application + Installer certificates
- `src-tauri/entitlements.plist` — network access entitlements
- Tauri handles signing during `cargo tauri build` with env vars set

### 4B. Auto-Updater
- `tauri-plugin-updater` checks an endpoint on launch
- NEW API route: `app/api/desktop/update/route.ts` — returns update manifest (version, download URL, signature)
- Ed25519 signing key for update verification
- Non-blocking "Update available — restart to install" prompt

### Tauri config additions:
```json
{
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "<ed25519 public key>",
      "endpoints": [
        "https://app.choquer.agency/api/desktop/update?target={{target}}&arch={{arch}}&current_version={{current_version}}"
      ]
    }
  }
}
```

### 4C. CI/CD (GitHub Actions)
- `.github/workflows/build-desktop.yml`
- Two jobs: Apple Silicon (`aarch64-apple-darwin`) + Intel (`x86_64-apple-darwin`)
- Or single Universal Binary (`universal-apple-darwin`) — one DMG for all Macs
- Steps: checkout → Rust → import certs → `cargo tauri build` → notarize → upload to GitHub Releases

### 4D. Download Page
- NEW: `app/download/page.tsx` — auto-detects architecture, shows download button
- Links to GitHub Releases DMGs

### Verification
1. `cargo tauri build` produces signed, notarized DMG
2. Drag-to-Applications install works
3. No Gatekeeper "unidentified developer" warning
4. App detects updates and installs them cleanly
5. Works on both Intel and Apple Silicon Macs

---

## Phase 5: Enhanced Real-Time

**Goal:** Migrate remaining REST polling to Convex subscriptions — everything updates instantly.

### Priority migrations

| Current Pattern | Migration | Impact |
|----------------|-----------|--------|
| `NotificationBell` polls `/api/admin/notifications/count` every 30s | `useQuery(api.notifications.getUnreadCount)` | Every user, every page — instant bell updates |
| `useClockStatusPoll` polls `/api/admin/timesheet/status` every 30s | New `useQuery` on `timesheetEntries.getCurrentShift` | FloatingTimerBar + AdminNav clock — instant |
| Service board fetches via REST | New `useQuery` on service board entries | Multi-user collaboration — instant status changes |

### Files to modify
- `components/NotificationBell.tsx` — replace polling with Convex `useQuery`
- NEW: `hooks/useClockStatusRealtime.ts` — Convex subscription replacing poll
- NEW: `convex/timesheetEntries.ts` → add `getCurrentShift` query
- Service board page components — wire up real-time hooks

### Verification
1. Two windows open — change ticket status in one, other updates in <1 second
2. Notification bell updates instantly (no 30s delay)
3. Clock in on one device → status updates on the other instantly

---

## Phase 6: Future Considerations (Not Scoped Yet)

- **iOS/Android** — Tauri v2 supports mobile targets; would need responsive UI redesign
- **Offline support** — Service worker for app shell caching; wait for Convex's offline story for data
- **Global keyboard shortcuts** — `Cmd+Shift+I` to open InsightPulse from anywhere (`tauri-plugin-global-shortcut`)
- **File system integration** — Drag-and-drop from Finder to tickets, native file pickers
- **Biometric auth** — Touch ID unlock for the app

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| WKWebView on older macOS versions may lack Web API features | Set minimum macOS 11.0 (Big Sur) — covers all Intel 2020+ and all Apple Silicon |
| Cookie not persisting in WKWebView | WKWebView uses `WKWebsiteDataStore.default()` which persists cookies. Fallback: `tauri-plugin-store` to manually persist and inject |
| Convex WebSocket blocked by macOS App Transport Security | Convex uses HTTPS/WSS — no ATS issues |
| Apple notarization rejection | Ensure no private API usage, proper entitlements, hardened runtime. Tauri handles this when configured |
| Large DMG size | Tauri produces ~10-15MB DMGs. Universal binary ~20-25MB. Well within acceptable range |

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Desktop wrapper | Tauri v2 (Rust backend + native WebView) |
| Web app | Next.js 16, React 19, TypeScript (unchanged) |
| Real-time DB | Convex (unchanged) |
| Native notifications | tauri-plugin-notification → macOS Notification Center |
| Auto-updater | tauri-plugin-updater + GitHub Releases |
| Distribution | DMG, Apple code signing + notarization |
| CI/CD | GitHub Actions |
| macOS support | 11.0+ (Big Sur), Intel and Apple Silicon |
