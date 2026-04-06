# InsightPulse Desktop App — Phase 6: Future Enhancements

## Context

Phases 1-5 deliver a fully functional, auto-updating macOS desktop app with native notifications and real-time data. Phase 6 transforms InsightPulse from "web app in a native window" into a true macOS power tool — and eventually a mobile companion.

Phase 6 is organized into four tiers by priority. Each tier can be shipped independently.

---

## Phase 3 Corrections (Discovered During Review)

While reviewing the full desktop app plan, the following inaccuracies were found in the existing `desktop-app-plan-phase-3.md`:

| What the plan says | What's actually true |
|---|---|
| NotificationBell uses 30-second polling — needs upgrade to real-time | NotificationBell **already uses** `useQuery(api.notifications.getUnreadCount)` and `useQuery(api.notifications.listByRecipient)` — it's fully real-time |
| `getUnreadCount` needs to be created in Convex | `getUnreadCount` **already exists** in `convex/notifications.ts` with `by_recipient_unread` index |
| `teamMemberId` should be prop-drilled from layout → AdminNav → NotificationBell | Components use `useSession()` hook to read session from cookie. **No prop-drilling needed** |
| NotificationBridge receives `teamMemberId` as a prop | NotificationBridge should use `useSession()` internally and accept **no props** |
| AdminNav.tsx needs modification to pass teamMemberId | **No changes to AdminNav.tsx needed** |

**Impact:** Phase 3 is simpler than originally planned:
- **NO changes** to `NotificationBell.tsx` (already real-time)
- **NO changes** to `AdminNav.tsx` (no prop-drilling)
- `NotificationBridge` uses `useSession()` internally
- Layout adds `<NotificationBridge />` with no props

---

## Phase Dependency Graph

```
Phase 5 (Real-Time)
    │
    ├──→ Tier 1: Productivity Wins
    │       ├── 6.1 Auto-Launch on Login
    │       ├── 6.2 Global Keyboard Shortcuts
    │       ├── 6.3 Menubar Quick-Actions
    │       ├── 6.4 Biometric Auth (Touch ID)
    │       └── 6.5 Native Clipboard Enhancement
    │
    ├──→ Tier 2: File & Media Operations
    │       ├── 6.6 Screenshot Capture for Tickets
    │       ├── 6.7 File System Integration
    │       └── 6.8 Screen Recording
    │
    ├──→ Tier 3: Mobile (iOS / Android)
    │       ├── 6.9  Tauri v2 Mobile Targets
    │       ├── 6.10 Mobile Push Notifications
    │       ├── 6.11 Responsive UI Adaptations
    │       └── 6.12 Mobile-Specific Features
    │
    └──→ Tier 4: Ambitious / Experimental
            ├── 6.13 Multi-Window Support
            ├── 6.14 Spotlight / Alfred Integration
            ├── 6.15 Calendar Sync (macOS Calendar)
            ├── 6.16 macOS Widgets (Notification Center)
            ├── 6.17 Handoff (Desktop ↔ Mobile)
            ├── 6.18 Offline Support
            ├── 6.19 Accessibility Audit
            └── 6.20 Performance Monitoring
```

---

## Tier 1: Quick Productivity Wins

**Goal:** Make InsightPulse feel like a native macOS power tool with keyboard-driven workflows and instant access.

### 6.1 Auto-Launch on Login

**What it does:** InsightPulse starts automatically when the user logs into macOS, minimized to the system tray. The app is immediately available without manually opening it.

**Plugin:** `tauri-plugin-autostart`

**Files to create/modify:**
- MODIFY: `src-tauri/Cargo.toml` — add `tauri-plugin-autostart = "2"`
- MODIFY: `src-tauri/capabilities/default.json` — add `autostart:default`, `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled`
- MODIFY: `src-tauri/src/lib.rs` — register plugin + Tauri command
- NEW: `src-tauri/src/autostart.rs` — enable/disable/check commands
- MODIFY: `app/admin/settings/page.tsx` or new `app/admin/settings/desktop/page.tsx` — toggle UI

**Technical details:**
```rust
// src/autostart.rs
use tauri_plugin_autostart::MacosLauncher;

// In lib.rs setup:
.plugin(tauri_plugin_autostart::init(
    MacosLauncher::LaunchAgent,  // Uses launchd (standard macOS approach)
    Some(vec!["--minimized"]),   // Start hidden in tray
))
```

**Settings UI:** A toggle on the Settings page (only visible in Tauri via `window.insightpulse.isDesktop`):
- "Launch InsightPulse at login" — on/off toggle
- When enabled, app starts minimized to system tray on macOS login
- Default: off (user opts in)

**Edge cases:**
- If the user moves the `.app` to a different folder, the launch agent path breaks → re-enable fixes it
- Multiple macOS user accounts: each user's launch agent is independent

**Estimated effort:** 1-2 hours | **Backend changes:** None

---

### 6.2 Global Keyboard Shortcuts

**What it does:** System-wide keyboard shortcuts that work even when InsightPulse is not focused. Press a shortcut from any app to instantly interact with InsightPulse.

**Plugin:** `tauri-plugin-global-shortcut`

**Shortcuts:**

| Shortcut | Action | Details |
|----------|--------|---------|
| `Cmd+Shift+I` | Show/focus InsightPulse | If hidden in tray, shows the window. If behind other apps, brings to front |
| `Cmd+Shift+T` | Quick-create ticket | Opens the menubar quick-create floating window (6.3) |
| `Cmd+Shift+C` | Toggle clock in/out | Starts or stops the timesheet timer |
| `Cmd+Shift+N` | Show notifications | Opens InsightPulse and focuses the notification dropdown |

**Files to create/modify:**
- MODIFY: `src-tauri/Cargo.toml` — add `tauri-plugin-global-shortcut = "2"`
- MODIFY: `src-tauri/capabilities/default.json` — add global-shortcut permissions
- NEW: `src-tauri/src/shortcuts.rs` — shortcut registration and handlers
- MODIFY: `src-tauri/src/lib.rs` — register plugin + module
- MODIFY: Settings page — shortcut customization UI (optional, Tauri-only)

**Technical details:**
```rust
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

// In setup:
app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+I", |app, _shortcut, event| {
    if event.state == ShortcutState::Pressed {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
});
```

**Edge cases:**
- Shortcut conflict with another app → registration fails silently. Settings page should show which shortcuts are active
- Shortcuts only work while the Tauri process is running (requires 6.1 Auto-Launch for always-available shortcuts)

**Estimated effort:** 2-3 hours | **Backend changes:** None
**Dependencies:** 6.3 (for quick-create shortcut)

---

### 6.3 Menubar Quick-Actions

**What it does:** Extends the Phase 2 system tray right-click menu with productivity shortcuts — create tickets, manage timers, and jump to assigned work without opening the main window.

**What gets added to the tray context menu:**

```
InsightPulse (tray icon)
├── Open InsightPulse
├── ─────────────
├── Quick Create Ticket...        → Opens floating mini-window
├── ─────────────
├── Clock In / Clock Out          → Toggles timesheet (label changes based on state)
├── ─────────────
├── My Open Tickets (3)           → Submenu
│   ├── CHQ-142: Fix login bug
│   ├── CHQ-155: Update homepage
│   └── CHQ-160: Client onboarding
├── ─────────────
├── Notifications (5)             → Opens app to notifications
├── ─────────────
└── Quit InsightPulse
```

**Quick-Create Ticket Floating Window:**
A small, focused Tauri window (400x300) that appears near the tray icon:
- Title field (required)
- Priority dropdown (low/medium/high/urgent)
- Assign to dropdown (team members)
- "Create" button → calls `POST /api/admin/tickets`
- Window closes on submit or Escape

**Files to create/modify:**
- MODIFY: `src-tauri/src/tray.rs` — extend context menu with new items
- NEW: `src-tauri/src/quick_create.rs` — floating window spawning + management
- NEW: `components/QuickCreateTicket.tsx` — minimal ticket creation form
- NEW: `app/quick-create/page.tsx` — route for the floating window to load
- MODIFY: `src-tauri/src/lib.rs` — register new commands

**Technical details:**
- Clock in/out: Tray handler calls existing `POST /api/admin/timesheet/clock-in` or `clock-out` via `reqwest` crate (Rust HTTP client), using the session cookie
- My Open Tickets: Fetched periodically (every 60s) from the existing `/api/admin/tickets` endpoint, filtered to assigned tickets
- Quick-create window: spawned as a second Tauri `WebviewWindow` loading `/quick-create`

**Edge cases:**
- Quick-create window already open → focus it instead of opening another
- Clock in/out requires active session → if no session, tray shows "Sign in to use" instead
- Ticket list may be stale (60s cache) → acceptable for a menu, not a primary view

**Estimated effort:** 4-6 hours | **Backend changes:** None (uses existing APIs)
**Dependencies:** Phase 2 (tray)

---

### 6.4 Biometric Auth (Touch ID)

**What it does:** Use Touch ID for quick re-authentication after the app has been idle, and for gating sensitive actions like viewing financials, deleting clients, or accessing payroll data.

**Plugin:** `tauri-plugin-biometric` (or direct `LocalAuthentication` framework via `objc` crate FFI)

**Two use cases:**

| Use Case | Trigger | Behavior |
|----------|---------|----------|
| **Quick unlock** | App idle for 15+ minutes, user clicks to interact | Touch ID prompt instead of full password re-entry. On success, session continues. On failure, fall back to password |
| **Sensitive action gate** | User tries to view payroll, delete client, export data | Touch ID prompt. On success, action proceeds. On failure, action blocked with error |

**Files to create/modify:**
- MODIFY: `src-tauri/Cargo.toml` — add `tauri-plugin-biometric = "2"` (or `objc`/`cocoa` for direct FFI)
- MODIFY: `src-tauri/capabilities/default.json` — add biometric permissions
- NEW: `src-tauri/src/biometric.rs` — authenticate command
- MODIFY: `src-tauri/src/lib.rs` — register command
- NEW: `components/BiometricGate.tsx` — wrapper component for sensitive areas
- NEW: `hooks/useBiometric.ts` — hook for checking availability + triggering auth

**Technical details:**
```rust
#[tauri::command]
pub async fn authenticate_biometric(reason: String) -> Result<bool, String> {
    // Uses LAContext from LocalAuthentication framework
    // reason = "Authenticate to view payroll data"
    // Returns true if Touch ID succeeds, false if cancelled
    // Falls back to device passcode if Touch ID not available
}
```

**Frontend pattern:**
```tsx
const { authenticate, isAvailable } = useBiometric();

const handleViewPayroll = async () => {
  if (isAvailable) {
    const ok = await authenticate("View payroll data");
    if (!ok) return; // User cancelled or failed
  }
  // Proceed with action
};
```

**Edge cases:**
- No Touch ID hardware (older Intel Macs without Touch Bar) → biometric check is skipped, falls back to session auth
- Touch ID disabled in System Settings → `isAvailable` returns false, feature is invisible
- Multiple failed Touch ID attempts → macOS locks out biometric, falls back to passcode

**Estimated effort:** 3-4 hours | **Backend changes:** None (session cookie is still the real auth)

---

### 6.5 Native Clipboard Enhancement

**What it does:** Copy ticket details, client info, and other structured data to the clipboard in useful formats — not just plain text.

**Plugin:** `tauri-plugin-clipboard-manager`

**What gets enhanced:**

| Action | What's Copied | Format |
|--------|--------------|--------|
| Copy ticket link | `https://choquer.app/admin/tickets?ticket=CHQ-142` | Plain URL |
| Copy ticket details | `CHQ-142: Fix login bug\nStatus: In Progress\nAssigned: Bryce\nPriority: High` | Structured text |
| Copy ticket for Slack | `*CHQ-142* — Fix login bug (In Progress, assigned to Bryce)` | Slack markdown |
| Copy client email | `client@example.com` | Plain text |
| Copy client summary | `Acme Corp — Active\nContact: John (john@acme.com)\nPackage: Growth ($2,500/mo)` | Structured text |

**Files to create/modify:**
- MODIFY: `src-tauri/Cargo.toml` — add `tauri-plugin-clipboard-manager = "2"`
- MODIFY: `src-tauri/capabilities/default.json` — add clipboard permissions
- NEW: `hooks/useClipboard.ts` — hook wrapping Tauri clipboard (falls back to `navigator.clipboard` in browser)
- MODIFY: Ticket detail components — add "Copy" buttons/context menu
- MODIFY: Client detail components — add "Copy" buttons

**Technical details:**
- In Tauri: uses `tauri-plugin-clipboard-manager` for rich clipboard (can set both plain text and HTML)
- In browser: falls back to `navigator.clipboard.writeText()` (plain text only)
- "Copy for Slack" format uses Slack's mrkdwn syntax

**Estimated effort:** 2-3 hours | **Backend changes:** None

---

## Tier 2: Enhanced File & Media Operations

**Goal:** Make InsightPulse the single tool for capturing, attaching, and managing files related to client work.

### 6.6 Screenshot Capture for Tickets

**What it does:** Capture a screenshot (full screen, window, or selection) and attach it directly to a ticket comment — all without leaving InsightPulse.

**How it works:**
1. User is on a ticket detail page
2. Clicks "Attach Screenshot" button (or uses keyboard shortcut)
3. macOS screenshot selection UI appears (crosshair cursor)
4. User selects area → screenshot saved to temp file
5. Temp file auto-uploaded to Vercel Blob via existing upload API
6. Blob URL inserted as an image in the ticket comment

**Files to create/modify:**
- NEW: `src-tauri/src/screenshot.rs` — Rust command wrapping `screencapture` CLI
- MODIFY: `src-tauri/src/lib.rs` — register command
- NEW: `hooks/useScreenshot.ts` — hook for triggering capture + upload
- MODIFY: Ticket comment editor — add "Attach Screenshot" button (Tauri-only)

**Technical details:**
```rust
#[tauri::command]
pub async fn capture_screenshot(mode: String) -> Result<Vec<u8>, String> {
    // mode: "selection" | "window" | "fullscreen"
    let temp_path = std::env::temp_dir().join("insightpulse_screenshot.png");
    
    let args = match mode.as_str() {
        "selection" => vec!["-i", "-s"],    // Interactive selection
        "window" => vec!["-i", "-w"],       // Window capture
        "fullscreen" => vec!["-x"],         // Full screen, no sound
        _ => vec!["-i", "-s"],
    };
    
    std::process::Command::new("screencapture")
        .args(&args)
        .arg(&temp_path)
        .status()
        .map_err(|e| e.to_string())?;
    
    // Read file bytes and return to frontend for upload
    std::fs::read(&temp_path).map_err(|e| e.to_string())
}
```

**Edge cases:**
- User cancels the screenshot (presses Escape) → `screencapture` exits with non-zero, command returns error, frontend handles gracefully
- macOS screen recording permission not granted → `screencapture` may fail for window/fullscreen modes. Selection mode works without permission
- Large screenshots (4K+ retina) → may be 5-10MB. Vercel Blob handles up to 500MB

**Estimated effort:** 4-6 hours | **Backend changes:** None (uses existing Vercel Blob upload)

---

### 6.7 File System Integration

**What it does:** Enhanced file handling — configurable download location, "Open with..." for attachments, and improved drag-and-drop from Finder.

**Plugins:** `tauri-plugin-dialog`, `tauri-plugin-fs`

**Features:**

| Feature | Details |
|---------|---------|
| **Configurable download folder** | Settings page lets user pick a default download location (e.g., `~/Documents/InsightPulse/`). Attachments save there automatically instead of prompting each time |
| **"Open with..." button** | On ticket attachments, a button that downloads the file and opens it with the system default app (Preview for PDFs, Photoshop for PSDs, etc.) |
| **Download progress indicator** | Native progress bar in the Tauri window while downloading large files |
| **Drag-and-drop from Finder** | Enhanced drop zone that shows a native-feeling overlay when dragging files over the ticket comment area |

**Files to create/modify:**
- MODIFY: `src-tauri/Cargo.toml` — add `tauri-plugin-dialog = "2"`, `tauri-plugin-fs = "2"`
- MODIFY: `src-tauri/capabilities/default.json` — add dialog + fs permissions
- NEW: `src-tauri/src/file_ops.rs` — download-and-open, save-to-folder commands
- MODIFY: `src-tauri/src/lib.rs` — register commands
- NEW: `hooks/useFileOps.ts` — hook wrapping Tauri file operations
- MODIFY: Ticket attachment components — add "Open with...", download location
- MODIFY: Settings page — download folder picker (Tauri-only)

**Estimated effort:** 3-4 hours | **Backend changes:** None

---

### 6.8 Screen Recording for Bug Reports

**What it does:** Record a short screen clip (10-60 seconds) and attach it to a ticket — perfect for bug reproduction steps or client feedback walkthroughs.

**How it works:**
1. User clicks "Record Screen" on a ticket
2. macOS screen recording permission prompt (first time only)
3. Recording starts with a visible timer overlay
4. User stops recording (click button or shortcut)
5. Video saved as `.mov`, uploaded to Vercel Blob
6. Blob URL inserted as a video link in the ticket comment

**Files to create/modify:**
- NEW: `src-tauri/src/screen_record.rs` — Rust command wrapping `screencapture -v`
- NEW: `components/RecordingOverlay.tsx` — floating timer/stop button during recording
- MODIFY: Ticket comment editor — add "Record Screen" button (Tauri-only)

**Technical details:**
```rust
#[tauri::command]
pub async fn start_recording() -> Result<String, String> {
    let temp_path = std::env::temp_dir().join("insightpulse_recording.mov");
    // screencapture -v starts video recording
    // Returns the process ID so we can stop it later
}

#[tauri::command]
pub async fn stop_recording(pid: u32) -> Result<Vec<u8>, String> {
    // Send SIGINT to screencapture process to stop recording
    // Read and return the .mov file bytes
}
```

**Edge cases:**
- Screen recording permission denied → clear error message with link to System Settings
- Recording too long (>60s) → auto-stop with warning
- Large video files → compress with `ffmpeg` if available, or limit resolution
- macOS Sequoia+ tightened screen recording permissions → may require re-granting per app update

**Estimated effort:** 4-6 hours | **Backend changes:** None (uses existing Vercel Blob upload)
**Dependencies:** Requires macOS screen recording permission

---

## Tier 3: Mobile (iOS / Android)

**Goal:** Bring InsightPulse to team members' phones — notifications on the go, quick ticket triage, and timesheet management from anywhere.

> **This is a major project.** Tier 3 is estimated at 2-4 weeks of focused work, not hours. Each sub-feature below is a project in itself.

### 6.9 Tauri v2 Mobile Targets

**What it does:** Compile InsightPulse as a native iOS and Android app using Tauri v2's mobile support. The app loads `https://choquer.app` in a native WebView, same as the macOS version.

**Technical approach:**
- Tauri v2 supports `tauri ios dev`, `tauri ios build`, `tauri android dev`, `tauri android build`
- iOS: WKWebView (same engine as macOS Tauri app)
- Android: Android WebView (Chromium-based)
- The app loads the live Vercel URL — no bundling needed

**Prerequisites:**
- Xcode 15+ (for iOS builds)
- Android Studio + Android SDK (for Android builds)
- Apple Developer Program membership (for iOS distribution — already needed for Phase 4 macOS signing)
- Google Play Developer account ($25 one-time — for Android distribution)

**Files to create/modify:**
- NEW: `src-tauri/gen/apple/` — generated iOS project (Xcode project, Info.plist, etc.)
- NEW: `src-tauri/gen/android/` — generated Android project (Gradle, AndroidManifest.xml, etc.)
- MODIFY: `src-tauri/tauri.conf.json` — add mobile-specific config (status bar, orientation, etc.)
- MODIFY: `src-tauri/Cargo.toml` — add mobile-specific features/deps

**Key mobile config:**
```json
{
  "app": {
    "iOS": {
      "minimumVersion": "15.0"
    },
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

**Edge cases:**
- iOS Safari WebView has different quirks than macOS WKWebView (keyboard handling, viewport, safe areas)
- Android WebView may not support all Web APIs used by TipTap editor
- Cookie persistence works differently on mobile (app may be killed by OS)
- Mobile data / slow connections — need loading states, timeout handling

**Estimated effort:** 1-2 weeks | **Backend changes:** Minor (mobile-specific API responses, viewport meta tags)

---

### 6.10 Mobile Push Notifications

**What it does:** Native push notifications on iOS (APNs) and Android (FCM) — ticket assignments, comments, mentions arrive even when the app is fully closed.

**Why this is different from Phase 3:**
Phase 3 uses local notifications triggered by an active Convex WebSocket subscription in the WebView. On mobile, the WebView is killed when the app is backgrounded. Real push notifications require server-side delivery via APNs/FCM.

**Architecture:**

```
Convex mutation (notification created)
  → Convex action (HTTP call to push service)
    → APNs (iOS) / FCM (Android)
      → Device receives push notification
        → User taps → app opens → navigates to link
```

**What needs to be built:**

| Component | Details |
|-----------|---------|
| **Device token registration** | On mobile app launch, get APNs/FCM token → store in Convex `deviceTokens` table |
| **Push delivery service** | Convex action or Vercel API route that sends pushes via APNs/FCM when a notification is created |
| **APNs integration** | Apple Push Notification service — requires APNs auth key (.p8 file), team ID, bundle ID |
| **FCM integration** | Firebase Cloud Messaging — requires Firebase project, service account key |
| **Token refresh handling** | APNs/FCM tokens can rotate — app must re-register on each launch |
| **Badge count sync** | Update iOS app badge via push payload |

**Files to create/modify:**
- NEW: `convex/deviceTokens.ts` — schema + CRUD for device tokens
- MODIFY: `convex/schema.ts` — add `deviceTokens` table
- NEW: `convex/pushNotifications.ts` — action to send push via APNs/FCM
- MODIFY: `convex/notifications.ts` — trigger push delivery after creating notification
- NEW: `lib/apns.ts` — Apple Push Notification service client
- NEW: `lib/fcm.ts` — Firebase Cloud Messaging client
- MODIFY: `src-tauri/src/lib.rs` — mobile: register for push notifications, send token to backend

**Environment variables needed:**
```
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_AUTH_KEY=<base64 .p8 file>
FCM_SERVICE_ACCOUNT=<base64 JSON>
```

**Estimated effort:** 1-2 weeks | **Backend changes:** Significant (new Convex table, push delivery service, APNs/FCM integration)
**Dependencies:** 6.9 (mobile app exists)

---

### 6.11 Responsive UI Adaptations

**What it does:** Make the InsightPulse web app usable on mobile screen sizes without a full redesign.

**Approach:** Progressive enhancement — the existing desktop layout remains the default. Mobile-specific CSS and components are added for small screens.

**Key adaptations:**

| Area | Desktop (Current) | Mobile Adaptation |
|------|-------------------|-------------------|
| **Navigation** | Left sidebar with full labels | Bottom tab bar with icons (5 tabs: Home, Tickets, CRM, Timesheet, More) |
| **Ticket list** | Table with columns | Card list (stacked, swipeable) |
| **Ticket detail** | Side-by-side info + comments | Stacked layout, scrollable |
| **TipTap editor** | Full toolbar | Simplified mobile toolbar (bold, italic, list, link) |
| **Data tables** | Multi-column tables | Horizontal scroll or card view toggle |
| **Modals** | Centered overlays | Full-screen sheets sliding up from bottom |
| **Date picker** | Calendar dropdown | Native mobile date input (`<input type="date">`) |

**Files to create/modify:**
- NEW: `components/MobileNav.tsx` — bottom tab bar navigation
- MODIFY: `app/admin/layout.tsx` — responsive layout switching (sidebar vs bottom tabs)
- MODIFY: Multiple components — add responsive Tailwind classes (`md:`, `lg:` breakpoints)
- MODIFY: `components/DatePicker.tsx` — mobile fallback to native input

**Estimated effort:** 1-2 weeks | **Backend changes:** None (purely frontend)
**Dependencies:** 6.9 (mobile app to test on)

---

### 6.12 Mobile-Specific Features

**What it does:** Platform features that only make sense on mobile.

**iOS-specific:**
- **Share Sheet** — share a URL, image, or text from any iOS app into InsightPulse (creates a ticket or comment). Requires a Share Extension (separate Xcode target)
- **Siri Shortcuts** — "Hey Siri, create a ticket in InsightPulse" or "Hey Siri, clock me in". Requires App Intents framework
- **App Clips** — lightweight version for quick ticket creation from a shared link (no full app install needed)

**Android-specific:**
- **Share Intent** — receive shared content from other Android apps
- **Home Screen Widget** — show active tickets count, hours today
- **Quick Settings Tile** — clock in/out from the notification shade

**Cross-platform:**
- **Haptic feedback** — vibrate on ticket status changes, timer start/stop
- **Camera integration** — take a photo and attach directly to a ticket
- **Barcode/QR scanner** — scan asset tags to link to tickets (future equipment tracking)

**Estimated effort:** Variable per feature (1-3 days each) | **Backend changes:** Minimal
**Dependencies:** 6.9 (mobile app), some features require 6.10 (push)

---

## Tier 4: Ambitious / Experimental

These features are high-effort or uncertain feasibility. Evaluate before committing.

### 6.13 Multi-Window Support

Open tickets, CRM records, or reports in separate native windows. Each window is a new Tauri `WebviewWindow` pointing to a specific route.

**Challenge:** Shared Convex subscriptions across windows (each has its own React tree). Window management (which is "main"?).

**Estimated effort:** 6-8 hours | **Feasibility:** High (Tauri supports multi-window natively)

### 6.14 Spotlight / Alfred Integration

Search tickets, clients, and team members from macOS Spotlight. Requires `CoreSpotlight` framework via Rust FFI — index searchable items locally, keep in sync with Convex.

**Challenge:** No Tauri plugin exists. Requires custom Objective-C bridging. Index sync complexity.

**Estimated effort:** 12-16 hours | **Feasibility:** Medium (significant FFI work)

### 6.15 Calendar Sync (macOS Calendar)

Sync InsightPulse meetings to macOS Calendar via `EventKit` framework. Optionally two-way.

**Challenge:** `EventKit` FFI, calendar permission prompt, conflict resolution for two-way sync.

**Estimated effort:** 8-12 hours | **Feasibility:** Medium (FFI complexity)

### 6.16 macOS Widgets (Notification Center)

Show "hours today", "active tickets", "next meeting" in macOS Notification Center widgets. Requires WidgetKit (SwiftUI-only, separate build target).

**Challenge:** Tauri does not support WidgetKit. Requires a separate Swift project communicating via App Groups.

**Estimated effort:** 16-24 hours | **Feasibility:** Low (outside Tauri's capabilities)

### 6.17 Handoff (Desktop ↔ Mobile)

Start viewing a ticket on desktop, pick up on mobile (and vice versa) via macOS/iOS Handoff.

**Challenge:** Requires both desktop and mobile apps + `NSUserActivity` framework + proper entitlements.

**Estimated effort:** 4-6 hours (if mobile app exists) | **Feasibility:** Medium
**Dependencies:** 6.9 (mobile app must exist)

### 6.18 Offline Support

Cache critical data locally for offline access. Requires local database (SQLite via `tauri-plugin-sql`) or Convex's upcoming offline support.

**Challenge:** Sync engine, conflict resolution, selective caching. Very high complexity if building from scratch.

**Recommendation:** Wait for Convex's native offline support to mature before attempting this.

**Estimated effort:** Weeks | **Feasibility:** Low (without Convex offline support)

### 6.19 Accessibility Audit

Audit all Tauri-specific surfaces (tray menus, native dialogs, floating windows) for VoiceOver, keyboard navigation, and high contrast support. Web app accessibility is handled by existing web standards.

**Estimated effort:** 4-6 hours | **Feasibility:** High (auditing, not building)

### 6.20 Performance Monitoring

Settings > About page showing app health: memory usage, CPU, WebView process stats, Convex connection status, last sync time. Uses `sysinfo` crate.

**Estimated effort:** 2-3 hours | **Feasibility:** High

---

## Recommended Implementation Order

```
After Phase 5 is complete:

Sprint 1 (Tier 1 — Quick Wins):
  6.1 Auto-Launch on Login           ~1-2 hours    Tauri only
  6.2 Global Keyboard Shortcuts      ~2-3 hours    Tauri only
  6.5 Native Clipboard Enhancement   ~2-3 hours    Tauri + minor web
  6.4 Biometric Auth (Touch ID)      ~3-4 hours    Tauri + minor web
  6.3 Menubar Quick-Actions          ~4-6 hours    Tauri + minor web

Sprint 2 (Tier 2 — File/Media):
  6.6 Screenshot Capture             ~4-6 hours    Tauri + web
  6.7 File System Integration        ~3-4 hours    Tauri + minor web
  6.8 Screen Recording               ~4-6 hours    Tauri + web

Sprint 3+ (Tier 3 — Mobile):
  6.9  Mobile Targets                ~1-2 weeks    Full project
  6.11 Responsive UI                 ~1-2 weeks    Frontend
  6.10 Mobile Push Notifications     ~1-2 weeks    Full stack
  6.12 Mobile-Specific Features      ~variable     Per feature

Future (Tier 4 — Evaluate):
  6.19 Accessibility Audit           ~4-6 hours    Audit
  6.20 Performance Monitoring        ~2-3 hours    Tauri only
  6.13 Multi-Window                  ~6-8 hours    Tauri + web
  6.14 Spotlight Integration         ~12-16 hours  Tauri + FFI
  6.15 Calendar Sync                 ~8-12 hours   Tauri + FFI
  6.16 Widgets                       blocked       Requires non-Tauri Swift project
  6.17 Handoff                       blocked       Requires 6.9 mobile
  6.18 Offline Support               blocked       Requires Convex offline
```

---

## Feature Dependency Map

```
Phase 2 (Tray) ──────→ 6.1 Auto-Launch
                  ├──→ 6.3 Menubar Quick-Actions ──→ 6.2 Global Shortcuts (shares quick-create UI)
Phase 1 ──────────├──→ 6.4 Touch ID
                  ├──→ 6.5 Clipboard
                  ├──→ 6.6 Screenshot ──→ 6.8 Screen Recording (shared upload infra)
                  ├──→ 6.7 File System
                  ├──→ 6.13 Multi-Window
                  ├──→ 6.14 Spotlight
                  ├──→ 6.15 Calendar
                  └──→ 6.19 Accessibility
                  └──→ 6.20 Perf Monitor

6.9 Mobile ───────├──→ 6.10 Push Notifications
                  ├──→ 6.11 Responsive UI
                  ├──→ 6.12 Mobile Features
                  ├──→ 6.17 Handoff
                  
Convex Offline ───────→ 6.18 Offline Support
```

---

## Backend Changes Summary

| Feature | Backend Change | Effort |
|---------|---------------|--------|
| Tier 1 (6.1-6.5) | None | — |
| Tier 2 (6.6-6.8) | None (uses existing Vercel Blob upload) | — |
| 6.9 Mobile Targets | Minor (viewport meta, mobile API tweaks) | Low |
| 6.10 Push Notifications | **Significant** — new `deviceTokens` table, APNs/FCM integration, push delivery action | High |
| 6.11 Responsive UI | None (purely frontend) | — |
| 6.14 Spotlight | New Convex query for recently updated items | Low |
| 6.18 Offline | Major Convex architecture for sync/conflict resolution | Very High |
| All others | None | — |

---

## Risk Register (Phase 6)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tauri v2 mobile support is immature | Medium | High | Test early with a bare-bones mobile build before committing to full Tier 3 |
| APNs/FCM integration complexity | High | Medium | Use a push notification service (e.g., OneSignal, Expo Push) to abstract provider differences |
| Screen recording permission changes in macOS Sequoia+ | Medium | Low | Test on latest macOS; `screencapture` CLI is Apple-maintained and unlikely to break |
| Global shortcuts conflict with other apps | Medium | Low | Allow customization in settings; fail gracefully if registration fails |
| Touch ID hardware not available on all Macs | Certain | Low | Feature detection — biometric features are invisible when hardware is absent |
| iOS App Store review rejection | Medium | High | Ensure no private API usage; WebView apps may face scrutiny — be prepared to justify |
| Android WebView compatibility with TipTap | Medium | Medium | Test TipTap thoroughly on Android; may need a simplified mobile editor |
| Multi-window Convex subscription cost | Low | Low | At 10-20 team members with 2-3 windows each, still minimal Convex load |
| WidgetKit / Share Sheet infeasibility in Tauri | High | Low | Accept that some native iOS/macOS features require separate Swift projects — evaluate ROI before investing |

---

## Tech Stack Additions (Phase 6)

| Layer | Technology | Features |
|-------|-----------|----------|
| Auto-launch | `tauri-plugin-autostart` | 6.1 |
| Global shortcuts | `tauri-plugin-global-shortcut` | 6.2 |
| Clipboard | `tauri-plugin-clipboard-manager` | 6.5 |
| Biometric | `tauri-plugin-biometric` | 6.4 |
| File dialogs | `tauri-plugin-dialog` | 6.7 |
| File system | `tauri-plugin-fs` | 6.7 |
| HTTP client (Rust) | `reqwest` | 6.3 (tray API calls) |
| Push (iOS) | Apple Push Notification service | 6.10 |
| Push (Android) | Firebase Cloud Messaging | 6.10 |
| System info | `sysinfo` crate | 6.20 |
