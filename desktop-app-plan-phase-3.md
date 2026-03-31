# InsightPulse Desktop App — Phase 3: Native Push Notifications

## Goal

Convex notifications appear as native macOS notifications instantly — even when the window is minimized/hidden in the system tray. This is the first phase that introduces changes to the Next.js web app (a new component + one layout modification), but all changes are no-ops in the browser.

---

## What This Phase Delivers

- **Instant native macOS notifications** — ticket assigned, comment, mention, etc. appear as macOS notification center popups within ~1 second of creation (via Convex real-time, not 30-second polling)
- **Notification click → navigate** — clicking a native notification shows/focuses the app and navigates directly to the relevant page (e.g., the ticket)
- **Real-time dock badge** — unread count on the dock icon updates instantly via Convex subscription (replaces Phase 2's 30-second fetch monkey-patch)
- **Real-time NotificationBell** — the in-app bell icon upgrades from 30-second polling to instant Convex subscription
- **Lazy permission prompt** — macOS notification permission is requested only when the first real notification arrives, not on app launch
- **Batch handling** — 4+ simultaneous notifications show a single summary ("You have 5 new notifications") instead of spamming
- **Permission status banner** — Settings > Notifications shows whether desktop notifications are enabled/disabled with guidance to re-enable
- **Background notifications** — notifications appear even when the window is hidden in the system tray (Phase 2 feature)

---

## Prerequisites

- Phase 1 complete — `src-tauri/` exists with a working Tauri shell
- Phase 2 complete — system tray, hide-on-close, dock badge, and JS bridge (`window.insightpulse.isDesktop`) are working
- The existing notification system is fully functional (Convex backend, NotificationBell, preferences)

---

## Architecture

### The Core Flow

```
Convex DB mutation (notification created by any user/cron/bot)
  → Convex real-time subscription (useQuery in NotificationBridge.tsx)
    → React useEffect diffs notification IDs against seenIds Set
      → New notifications enter 300ms batch window
        → Batch processed: 1-3 shown individually, 4+ shown as summary
          → window.__TAURI__.core.invoke("show_notification", { title, body, link })
            → Rust: checks/requests macOS permission → shows native notification
              → User clicks notification
                → Rust on_action handler: show/focus window → emit "notification-navigate" event
                  → Frontend listener: router.push(link)
```

### Why This Works

Convex already provides real-time subscriptions via `useQuery`. When a notification is created server-side, any client subscribed to `listByRecipient` for that user receives the update instantly (~100ms). The entire "push" mechanism piggybacks on Convex's existing reactive system — no WebSockets, SSE, or custom push infrastructure needed.

The bridge between Convex's real-time data and macOS native notifications happens in a single React component (`NotificationBridge`) that compares successive snapshots of the notification list to detect new entries.

### Why Notification Preferences Are NOT Checked Client-Side

Preferences are already checked server-side in `lib/notifications.ts` → `createNotification()` → `shouldNotify()` BEFORE the Convex mutation is called. If a user has disabled a notification type, the notification is never created in the database. `NotificationBridge` never sees it. Zero client-side filtering needed.

---

## Project Structure After Phase 3

New and modified files shown. Everything else from Phase 1-2 is unchanged.

```
insightpulse/
  src-tauri/
    Cargo.toml                                    # MODIFIED — add tauri-plugin-notification
    capabilities/default.json                     # MODIFIED — add notification permissions
    tauri.conf.json                               # MODIFIED — add backgroundThrottling: false
    src/
      lib.rs                                      # MODIFIED — register notification plugin, commands, click handler
      bridge.rs                                   # MODIFIED — remove fetch monkey-patch for badge sync
      notifications.rs                            # NEW — show_notification, set_badge_count, check_permission commands
  components/
    NotificationBridge.tsx                         # NEW — real-time Convex → native notification bridge
    NotificationPermissionBanner.tsx               # NEW — settings page permission status
    NotificationBell.tsx                           # MODIFIED — upgrade to real-time Convex subscription
  app/
    admin/
      layout.tsx                                  # MODIFIED — add <NotificationBridge>
      settings/notifications/page.tsx             # MODIFIED — add <NotificationPermissionBanner>
```

---

## File-by-File Specification

### 1. `src-tauri/Cargo.toml` (Modified)

Add the notification plugin dependency.

```toml
[dependencies]
# ... existing Phase 2 deps ...
tauri-plugin-notification = "2"    # Phase 3 — native macOS notifications
```

**Why `tauri-plugin-notification`:** Official Tauri v2 plugin for native notifications. Handles macOS permission requests, notification display, action handling, and badge management through Apple's UserNotifications framework. Well-maintained, handles all the Objective-C bridging internally.

---

### 2. `src-tauri/capabilities/default.json` (Modified)

Add notification permissions to the existing capability file.

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
    "notification:allow-set-badge-count"
  ]
}
```

**What each notification permission allows:**
- `notification:default` — basic notification functionality
- `notification:allow-is-permission-granted` — check if macOS permission is granted
- `notification:allow-request-permission` — trigger the macOS permission prompt
- `notification:allow-notify` — actually show a notification
- `notification:allow-register-action-types` — register click/action handlers
- `notification:allow-set-badge-count` — update the dock icon badge via Apple's API

**Why explicit permissions:** Without these, `window.__TAURI__.core.invoke()` calls from the frontend will fail silently with a permission error. Tauri v2's capability system requires explicit grants for every API surface.

---

### 3. `src-tauri/tauri.conf.json` (Modified)

Add `backgroundThrottling: false` to the main window configuration.

```json
{
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
    ]
  }
}
```

**Why `backgroundThrottling: false`:** When the window is hidden (tray mode from Phase 2), macOS may throttle or suspend the WebView process. This would kill the Convex WebSocket subscription, preventing notifications from arriving while the window is hidden. Disabling background throttling keeps the WebView alive. The trade-off is slightly higher battery usage, but this is necessary for the core Phase 3 feature (notifications while minimized).

---

### 4. `src-tauri/src/notifications.rs` (New)

The Rust module handling native macOS notifications.

```rust
use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};

/// Show a native macOS notification
///
/// Permission is requested lazily on the first invocation.
/// If the user has denied permission, returns an error string.
/// The frontend handles this gracefully (silent degradation).
#[tauri::command]
pub async fn show_notification(
    app: AppHandle,
    title: String,
    body: Option<String>,
    link: Option<String>,
) -> Result<(), String> {
    // Check current permission state
    let permission = app
        .notification()
        .permission_state()
        .map_err(|e| e.to_string())?;

    // If never asked, request permission now (lazy prompt)
    if permission == PermissionState::Unknown {
        let result = app
            .notification()
            .request_permission()
            .map_err(|e| e.to_string())?;
        if result != PermissionState::Granted {
            return Err("Notification permission not granted".to_string());
        }
    }

    // If previously denied, don't try
    if permission == PermissionState::Denied {
        return Err("Notification permission denied".to_string());
    }

    // Build the notification
    let mut builder = app.notification().builder();
    builder = builder.title(&title);

    if let Some(ref b) = body {
        builder = builder.body(b);
    }

    // Attach link as extra data for the click handler
    if let Some(ref l) = link {
        builder = builder
            .action_type_id("navigate")
            .extra("link", l.as_str());
    }

    builder.show().map_err(|e| e.to_string())?;

    Ok(())
}

/// Update the dock icon badge count
///
/// count = 0 clears the badge entirely.
/// This replaces the Phase 2 fetch monkey-patch approach with real-time updates.
#[tauri::command]
pub async fn set_badge_count(app: AppHandle, count: u32) -> Result<(), String> {
    if count == 0 {
        app.notification()
            .set_badge_count(None)
            .map_err(|e| e.to_string())?;
    } else {
        app.notification()
            .set_badge_count(Some(count as i32))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Check the current macOS notification permission state
///
/// Returns: "granted", "denied", or "unknown"
/// Used by the settings page to show the permission status banner.
#[tauri::command]
pub async fn check_notification_permission(app: AppHandle) -> Result<String, String> {
    let state = app
        .notification()
        .permission_state()
        .map_err(|e| e.to_string())?;

    Ok(match state {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        PermissionState::Unknown => "unknown",
    }
    .to_string())
}

/// Register the notification action type and click handler
///
/// Called once during app setup. Registers a "navigate" action type
/// and listens for notification clicks to show/focus the window
/// and emit a navigation event to the frontend.
pub fn setup_notification_actions(app: &tauri::App) {
    use tauri::Manager;
    use tauri_plugin_notification::{Action, ActionType};

    // Register the "navigate" action type used by show_notification
    let _ = app.notification().register_action_types(&[ActionType {
        id: "navigate".to_string(),
        actions: vec![Action {
            id: "open".to_string(),
            title: "Open".to_string(),
            requires_authentication: false,
            foreground: true,
            destructive: false,
            input: false,
            input_button_title: None,
            input_placeholder: None,
        }],
    }]);

    // Listen for notification clicks
    let app_handle = app.handle().clone();
    app.notification().on_action(move |action| {
        // Extract the link URL from notification extras
        if let Some(link) = action.extra.get("link") {
            if let Some(link_str) = link.as_str() {
                // Show and focus the main window (may be hidden in tray)
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    // Emit navigation event — frontend listener calls router.push()
                    let _ = window.emit("notification-navigate", link_str);
                }
            }
        } else {
            // No link — just show/focus the window
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
```

**Three commands explained:**

| Command | Purpose | Called by |
|---------|---------|----------|
| `show_notification` | Shows a native macOS notification with title/body/link | `NotificationBridge.tsx` when new notification detected |
| `set_badge_count` | Updates dock icon badge (0 = clear) | `NotificationBridge.tsx` when unread count changes |
| `check_notification_permission` | Returns permission state as string | `NotificationPermissionBanner.tsx` on settings page |

**Why a custom Rust command instead of calling the notification plugin directly from JS:** Wrapping in a Rust command gives us: (a) server-side permission checking before attempting to show, (b) a single place to attach action data for click handling, (c) cleaner error handling, (d) ability to add rate limiting on the Rust side if needed in the future.

**Notification click flow:**
1. `on_action` fires when user clicks the notification
2. Extracts the `link` from the notification's `extra` data
3. Shows and focuses the main window (critical for tray mode)
4. Emits a `"notification-navigate"` Tauri event with the link URL
5. The frontend `NotificationBridge` listens for this event and calls `router.push(link)`

---

### 5. `src-tauri/src/lib.rs` (Modified)

Register the notification module, plugin, commands, and setup.

```rust
mod menu;
mod tray;
mod dock;
mod bridge;
mod deep_link;
mod notifications;    // NEW — Phase 3

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())    // NEW — Phase 3
        // Commands callable from JavaScript
        .invoke_handler(tauri::generate_handler![
            dock::update_dock_badge,                          // Phase 2 (kept for backwards compat)
            notifications::show_notification,                 // Phase 3
            notifications::set_badge_count,                   // Phase 3
            notifications::check_notification_permission,     // Phase 3
        ])
        // App setup
        .setup(|app| {
            // Phase 2 setup (menu, tray, deep links, window behavior, bridge)
            let menu = menu::build_menu(app)?;
            app.set_menu(menu)?;
            tray::setup_tray(app.handle())?;
            deep_link::setup_deep_links(app)?;

            // Phase 3: Register notification action types and click handler
            notifications::setup_notification_actions(app);

            // ... rest of Phase 2 setup (window events, navigation interception, etc.)

            let main_window = app
                .get_webview_window("main")
                .expect("main window not found");

            // Hide-on-close (Phase 2 — unchanged)
            let window_for_close = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            // JS bridge injection (Phase 2 — badge sync removed in Phase 3)
            let window_for_bridge = main_window.clone();
            main_window.on_page_load(move |_webview, payload| {
                if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                    bridge::inject_all(&window_for_bridge);
                }
            });

            // External link interception (Phase 1 — unchanged)
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

**What changed from Phase 2:**
- Added `mod notifications;`
- Added `.plugin(tauri_plugin_notification::init())`
- Added 3 notification commands to `invoke_handler`
- Added `notifications::setup_notification_actions(app)` call in setup

---

### 6. `src-tauri/src/bridge.rs` (Modified — Remove Badge Monkey-Patch)

Phase 2's `bridge.rs` injected two scripts: desktop detection + fetch monkey-patch for dock badge sync. Phase 3 replaces the badge sync with real-time Convex subscription, so the monkey-patch is removed.

```rust
use tauri::WebviewWindow;

/// Inject all bridge scripts into the webview after page load
pub fn inject_all(webview: &WebviewWindow) {
    inject_desktop_detection(webview);
    // Badge sync removed in Phase 3 — now handled by NotificationBridge.tsx
    // via real-time Convex subscription + set_badge_count command
}

/// Set window.insightpulse for feature detection in the web app
fn inject_desktop_detection(webview: &WebviewWindow) {
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

// REMOVED: inject_dock_badge_sync()
// The fetch monkey-patch that intercepted /api/admin/notifications/count
// responses is no longer needed. NotificationBridge.tsx subscribes to
// useQuery(api.notifications.getUnreadCount) and calls the set_badge_count
// Rust command directly, providing real-time badge updates (~100ms)
// instead of the 30-second polling interval.
```

---

### 7. `components/NotificationBridge.tsx` (New — The Core Component)

This is the heart of Phase 3. A `"use client"` component that renders nothing visually but manages the real-time Convex subscription and bridges notifications to the native macOS notification system.

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";

// ── Batching constants ──
const BATCH_WINDOW_MS = 300;   // Wait 300ms after last new notification before processing
const STAGGER_DELAY_MS = 200;  // Delay between individual notifications (prevents macOS coalescing)
const SUMMARY_THRESHOLD = 4;   // 4+ notifications → show summary instead of individual
const SEEN_IDS_CLEANUP = 1000; // Clean up seenIds Set when it exceeds this size

interface NotificationDoc {
  _id: string;
  _creationTime: number;
  title: string;
  body?: string;
  link?: string;
  type: string;
  isRead: boolean;
}

export default function NotificationBridge({
  teamMemberId,
}: {
  teamMemberId: string;
}) {
  const router = useRouter();

  // ── Real-time Convex subscriptions ──
  // These stay active even when the window is hidden (tray mode)
  // because backgroundThrottling is disabled in tauri.conf.json
  const notifications = useQuery(api.notifications.listByRecipient, {
    recipientId: teamMemberId as Id<"teamMembers">,
    limit: 30,
  });

  const unreadCount = useQuery(api.notifications.getUnreadCount, {
    recipientId: teamMemberId as Id<"teamMembers">,
  });

  // ── Refs for tracking state across renders ──
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const batchQueueRef = useRef<NotificationDoc[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const nativeShownRef = useRef<Set<string>>(new Set());

  // ── Helpers ──

  const isTauri = useCallback(() => {
    return typeof window !== "undefined" && !!(window as unknown as { __TAURI__: unknown }).__TAURI__;
  }, []);

  /** Send a single native notification via the Rust command */
  const sendNativeNotification = useCallback(
    async (title: string, body?: string, link?: string) => {
      if (!isTauri()) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (window as any).__TAURI__.core.invoke("show_notification", {
          title,
          body: body || undefined,
          link: link || undefined,
        });
      } catch {
        // Permission denied or other error — silent degradation
        // The in-app NotificationBell still works regardless
      }
    },
    [isTauri]
  );

  /** Process the batch queue after the debounce window */
  const processBatch = useCallback(async () => {
    if (!mountedRef.current) return;

    const queue = [...batchQueueRef.current];
    batchQueueRef.current = [];
    batchTimerRef.current = null;

    if (queue.length === 0) return;

    if (queue.length >= SUMMARY_THRESHOLD) {
      // 4+ notifications: single summary to prevent spam
      await sendNativeNotification(
        "InsightPulse",
        `You have ${queue.length} new notifications`,
        "/admin"
      );
    } else {
      // 1-3 notifications: show each individually with stagger
      for (let i = 0; i < queue.length; i++) {
        if (!mountedRef.current) return;
        const n = queue[i];

        // Guard against showing the same notification twice in one session
        if (nativeShownRef.current.has(n._id)) continue;
        nativeShownRef.current.add(n._id);

        await sendNativeNotification(n.title, n.body, n.link);

        // Stagger between multiple notifications (prevents macOS coalescing)
        if (i < queue.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, STAGGER_DELAY_MS));
        }
      }
    }

    // Trigger the in-app NotificationBell to refresh immediately
    window.dispatchEvent(new CustomEvent("notificationChange"));
  }, [sendNativeNotification]);

  /** Add a notification to the batch queue and reset the debounce timer */
  const enqueueNotification = useCallback(
    (notification: NotificationDoc) => {
      batchQueueRef.current.push(notification);

      // Reset the batch window timer — waits for rapid-fire notifications to settle
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
      batchTimerRef.current = setTimeout(processBatch, BATCH_WINDOW_MS);
    },
    [processBatch]
  );

  // ── Effect: Diff notifications to detect new ones ──
  useEffect(() => {
    if (!notifications) return; // Query still loading

    if (!initializedRef.current) {
      // First load: capture ALL existing notification IDs as "already seen"
      // This prevents showing old notifications as native popups on mount
      for (const n of notifications) {
        seenIdsRef.current.add(n._id);
      }
      initializedRef.current = true;
      return;
    }

    // Subsequent Convex updates: find IDs we haven't seen before
    for (const n of notifications) {
      if (!seenIdsRef.current.has(n._id) && !n.isRead) {
        seenIdsRef.current.add(n._id);
        enqueueNotification(n as unknown as NotificationDoc);
      }
    }

    // Defensive: prevent unbounded Set growth during long sessions
    if (seenIdsRef.current.size > SEEN_IDS_CLEANUP) {
      const currentIds = new Set(notifications.map((n) => n._id));
      seenIdsRef.current = currentIds;
    }
  }, [notifications, enqueueNotification]);

  // ── Effect: Real-time dock badge sync ──
  useEffect(() => {
    if (!isTauri() || unreadCount === undefined) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.core
      .invoke("set_badge_count", { count: unreadCount })
      .catch(() => {
        // Silent — badge update is non-critical
      });
  }, [unreadCount, isTauri]);

  // ── Effect: Listen for notification click navigation from Rust ──
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.event
      .listen("notification-navigate", (event: { payload: string }) => {
        if (event.payload) {
          router.push(event.payload);
        }
      })
      .then((fn: () => void) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [router, isTauri]);

  // ── Effect: Cleanup on unmount ──
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  // This component renders nothing — it is purely a side-effect bridge
  return null;
}
```

**Design decisions explained:**

| Design | Rationale |
|--------|-----------|
| `seenIdsRef` Set | On mount, captures all existing IDs so old notifications don't trigger popups. Simple, deterministic — no timestamps to compare, no server-side "delivered" flags |
| `initializedRef` boolean | Distinguishes "first query result" (capture snapshot) from "reactive update" (diff for new). Without this, every render would re-process all notifications |
| 300ms batch window | Bulk operations (assign 10 tickets) create many notifications near-simultaneously. Convex may deliver them as one update or rapid successive updates. The debounce catches both |
| `nativeShownRef` Set | Session-level dedup. Prevents showing the same notification twice if Convex re-evaluates the query due to an unrelated row change |
| `mountedRef` boolean | Async safety. Batch processing and stagger delays are async. If the component unmounts mid-processing (logout), this prevents orphaned operations |
| `limit: 30` | Matches the existing Convex function default. If 30+ notifications arrive between two updates, only the 30 most recent are tracked. Acceptable — the summary notification handles "many at once" |
| `dispatchEvent("notificationChange")` | Triggers the existing NotificationBell to refresh its count, keeping the in-app badge in sync |
| `SEEN_IDS_CLEANUP` at 1000 | Prevents unbounded memory growth during multi-day sessions. Resets the Set to only current query IDs |

**Browser behavior:** Every `isTauri()` check gates the native notification logic. In a browser, `window.__TAURI__` is `undefined`, so the component's effects are complete no-ops. The Convex subscriptions still run (they're needed for the NotificationBell upgrade), but no native notifications are sent.

---

### 8. `app/admin/layout.tsx` (Modified)

Add `NotificationBridge` to the authenticated admin layout.

```tsx
import NotificationBridge from "@/components/NotificationBridge";

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
      <div className="max-w-[1400px] mx-auto px-10 py-8 pb-20">
        {children}
      </div>
      <FloatingTimerBar />
      <GlobalTicketModal />
    </KeyboardShortcutProvider>
  </div>
);
```

**Why this placement:**
- `teamMemberId` is available from the server-side session — same pattern as `AdminNav` receiving `userName` and `roleLevel`
- A standalone component follows single-responsibility — not coupled to AdminNav
- Renders `null` so it doesn't affect layout
- Can be removed or disabled without touching any other component

**Why not inside AdminNav:** AdminNav owns navigation UI. Coupling notification side-effects to it makes both harder to maintain. If notifications need to be disabled or modified, you don't want to risk breaking the nav.

---

### 9. `components/NotificationBell.tsx` (Modified — Upgrade to Real-Time)

Replace the 30-second polling with a Convex real-time subscription. The component keeps its existing UI and dropdown but gets its data from `useQuery` instead of `fetch` + `setInterval`.

**Key changes:**

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// Add teamMemberId prop (passed from AdminNav or layout)
export default function NotificationBell({ teamMemberId }: { teamMemberId: string }) {
  // Real-time unread count — replaces the 30-second poll
  const unreadCount = useQuery(api.notifications.getUnreadCount, {
    recipientId: teamMemberId as Id<"teamMembers">,
  }) ?? 0;

  // Real-time notification list — replaces the fetch-on-open pattern
  const notifications = useQuery(api.notifications.listByRecipient, {
    recipientId: teamMemberId as Id<"teamMembers">,
    limit: 20,
  });

  // ... rest of component UI unchanged (dropdown, mark read, etc.)
  // But now `unreadCount` and `notifications` update in real-time
  // No more setInterval, no more fetch('/api/admin/notifications/count')
}
```

**What gets removed:**
- `setInterval(fetchCount, 30000)` — the 30-second poll
- `fetchCount()` — the `/api/admin/notifications/count` fetch
- `fetchNotifications()` — the `/api/admin/notifications` fetch on dropdown open

**What stays:**
- The dropdown UI, mark-read/mark-all-read/delete handlers (these still call PUT/DELETE API routes for mutations)
- The `"notificationChange"` event listener (still useful for cross-component sync)
- The badge rendering logic (99+ cap, red dot)

**Note:** This upgrade means NotificationBell now needs `teamMemberId` as a prop. Since NotificationBell is rendered inside `AdminNav`, and AdminNav is already receiving props from the layout, we need to pass `teamMemberId` through AdminNav to NotificationBell. This is a one-line change in AdminNav's props interface and JSX.

**Alternative if prop drilling is unwanted:** NotificationBell could read the session cookie client-side to get the teamMemberId. But since the layout already has the session and passes props to AdminNav, prop drilling is cleaner and avoids client-side cookie parsing.

---

### 10. `components/NotificationPermissionBanner.tsx` (New)

Shows notification permission status on the Settings > Notifications page.

```tsx
"use client";

import { useState, useEffect } from "react";

export default function NotificationPermissionBanner() {
  const [permissionState, setPermissionState] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tauriAvailable = !!(window as any).__TAURI__;
    setIsTauri(tauriAvailable);
    if (!tauriAvailable) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__.core
      .invoke("check_notification_permission")
      .then((state: string) => setPermissionState(state))
      .catch(() => setPermissionState(null));
  }, []);

  // Browser users don't see this banner
  if (!isTauri) return null;

  if (permissionState === "denied") {
    return (
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-500 mt-0.5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Desktop notifications are disabled
            </p>
            <p className="text-xs text-amber-700 mt-1">
              To receive native notifications, open{" "}
              <strong>
                System Settings &gt; Notifications &gt; InsightPulse
              </strong>{" "}
              and enable &quot;Allow Notifications.&quot;
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (permissionState === "granted") {
    return (
      <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-emerald-500 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <p className="text-sm text-emerald-800">
            Desktop notifications are enabled
          </p>
        </div>
      </div>
    );
  }

  // "unknown" or loading — don't show anything
  return null;
}
```

**Why this component exists:** macOS does not allow re-prompting for notification permission once denied. The only recovery path is System Settings > Notifications > InsightPulse. Without this banner, users who denied the prompt would never know how to re-enable notifications. The banner is only visible in the Tauri app (not the browser).

---

### 11. `app/admin/settings/notifications/page.tsx` (Modified)

Add the permission banner above the existing notification preferences.

```tsx
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";

// In the page component, before the preferences section:
<NotificationPermissionBanner />
{/* Existing notification preferences UI */}
```

---

## How Everything Connects (Data Flow Diagram)

### Notification Creation → Native Popup

```
1. Server-side event (ticket assigned, comment, etc.)
2. lib/notifications.ts → createNotification()
3. → shouldNotify() checks user preferences → if disabled, STOP
4. → convex/notifications.ts → create() mutation
5. → Convex DB writes new notification document
6. → Convex real-time pushes update to all subscribers (~100ms)
7. → NotificationBridge.tsx useQuery callback fires
8. → useEffect diffs: new _id not in seenIdsRef → enqueue
9. → 300ms batch timer expires → processBatch()
10. → 1-3 notifications: show individually with 200ms stagger
     4+ notifications: show single summary
11. → window.__TAURI__.core.invoke("show_notification", {...})
12. → Rust: check permission → build notification → show()
13. → macOS Notification Center displays popup with sound
```

### Notification Click → App Navigation

```
1. User clicks native macOS notification
2. → Rust: on_action handler fires
3. → Extracts "link" from notification.extra
4. → window.show() + window.set_focus() (unhides from tray)
5. → window.emit("notification-navigate", link)
6. → Frontend: event listener in NotificationBridge
7. → router.push(link) → Next.js navigates to the page
```

### Real-Time Badge Update

```
1. Notification created/read in Convex
2. → useQuery(api.notifications.getUnreadCount) updates
3. → useEffect fires with new count
4. → window.__TAURI__.core.invoke("set_badge_count", { count })
5. → Rust: app.notification().set_badge_count()
6. → macOS updates dock icon badge
```

---

## Edge Cases & How They're Handled

| Scenario | Behavior | Why |
|----------|----------|-----|
| **App startup** | Existing notifications captured as "seen" — no native popups | `initializedRef` gates the first query result as a snapshot, not an update |
| **Page refresh** | Same as startup — fresh snapshot, no popups for existing | Component remounts, `seenIdsRef` is rebuilt from current query result |
| **Window hidden (tray mode)** | Notifications still appear as native popups | `backgroundThrottling: false` keeps WebView alive; Convex subscription active |
| **2-3 rapid notifications** | Each shown individually with 200ms stagger | Stagger prevents macOS from coalescing them into one |
| **4+ rapid notifications** | Single summary: "You have N new notifications" | Prevents notification spam from bulk operations |
| **Network disconnection** | No notifications during offline; missed ones trigger popups on reconnect | Convex auto-reconnects; notifications created during offline appear in the restored query, diff detects them as new |
| **User logs out** | Component unmounts, all refs cleared | Admin layout unmounts when session is null → NotificationBridge unmounts |
| **Login as different user** | Fresh component instance, new subscription, new snapshot | New `teamMemberId` prop → new Convex subscriptions → clean state |
| **Notification with no link** | Popup shown; click just shows/focuses app (no navigation) | Rust `on_action` checks for link — if absent, just show window |
| **Permission denied** | `show_notification` returns error, caught silently | In-app NotificationBell still works; settings page shows guidance banner |
| **macOS Focus mode (DND)** | Notifications suppressed by OS | No API to detect this; user must configure Focus mode to allow InsightPulse |
| **Browser (non-Tauri)** | All Tauri logic is no-op; Convex subscriptions still power NotificationBell | `isTauri()` check gates every native call |
| **Convex query returns undefined** | `if (!notifications) return;` — no processing | Query is loading; effect waits for resolved data |
| **Long session (days open)** | `seenIdsRef` cleaned up at 1000 entries | Prevents unbounded memory growth; resets to current query IDs |
| **React strict mode (dev)** | Component may double-mount; slight chance of duplicate popup | `nativeShownRef` prevents duplicate native notifications per session |
| **Multiple Tauri windows** | Not applicable — single-window app | Tauri config defines one window (`main`). If multi-window is added later, each window would have its own NotificationBridge — would need dedup |
| **Notification count > 99** | Dock badge shows "99+" | Matches existing NotificationBell behavior; `set_badge_count` in Rust passes raw count, macOS displays the number |

---

## What This Phase Changes in the Web App

This is the first phase with web app changes. All changes are backwards-compatible — the web app works identically in a browser.

| File | Change | Browser Impact |
|------|--------|----------------|
| `components/NotificationBridge.tsx` | NEW | No-op in browser (`isTauri()` returns false), Convex subscriptions still run (powers NotificationBell) |
| `components/NotificationPermissionBanner.tsx` | NEW | Hidden in browser (`!isTauri` → returns null) |
| `components/NotificationBell.tsx` | MODIFIED | Better in browser — real-time updates instead of 30-second poll |
| `app/admin/layout.tsx` | 1 line added | Renders null in browser (NotificationBridge) |
| `app/admin/settings/notifications/page.tsx` | 1 line added | Renders null in browser (NotificationPermissionBanner) |

---

## What This Phase Does NOT Include

These are explicitly deferred:

| Feature | Phase | Why deferred |
|---------|-------|-------------|
| Notification grouping by ticket | Future | Requires `threadIdentifier` in macOS notification; complexity vs. value is low for team size |
| Custom notification sounds | Future | Default macOS sound is fine; custom requires bundling audio files |
| Inline reply actions | Future | macOS supports reply buttons but adds significant complexity |
| Do Not Disturb detection | N/A | No API available from Tauri; users manage via macOS Focus settings |
| Code signing & notarization | Phase 4 | Required for distribution |
| Auto-updater | Phase 4 | Required for updates |
| Clock status real-time migration | Phase 5 | `useClockStatusPoll` is a separate concern |
| Service board real-time | Phase 5 | Separate concern |

---

## Implementation Sequence

Features are ordered by dependency — each step builds on the previous.

### Step 1: Rust Notification Plugin Setup
**Files:** `Cargo.toml`, `capabilities/default.json`, `notifications.rs` (new), `lib.rs`
- Add `tauri-plugin-notification = "2"` to Cargo.toml
- Add notification permissions to capabilities
- Create `notifications.rs` with three commands + `setup_notification_actions`
- Register plugin and commands in `lib.rs`
- **Verify:** Build the Tauri app. Open WebView console. Run:
  ```js
  await window.__TAURI__.core.invoke("check_notification_permission")
  // Should return "unknown" on first run
  ```

### Step 2: NotificationBridge Component (Core Bridge)
**Files:** `NotificationBridge.tsx` (new), `app/admin/layout.tsx`
- Create the component with full Convex subscriptions and batch logic
- Add to admin layout with `teamMemberId` prop
- **Verify:** Log in to the Tauri app. Have someone assign a ticket to you (or create a notification via API). Within ~1 second, a native macOS popup appears. The first notification should trigger the macOS permission prompt.

### Step 3: Badge Count Integration
**Files:** `NotificationBridge.tsx` (badge effect), `bridge.rs` (remove monkey-patch)
- The `set_badge_count` effect in NotificationBridge is already in the component from Step 2
- Remove the `inject_dock_badge_sync()` function from `bridge.rs`
- **Verify:** Create a notification → dock badge updates within ~1 second. Mark as read → badge decrements. Mark all read → badge disappears.

### Step 4: Notification Click Handling
**Files:** Already implemented in `notifications.rs` (on_action) and `NotificationBridge.tsx` (event listener)
- **Verify:** Click a native notification → app window shows/focuses → navigates to the correct page (e.g., the ticket). Test while app is visible AND while hidden in tray.

### Step 5: Background Throttling
**Files:** `tauri.conf.json`
- Add `"backgroundThrottling": false` to the main window config
- **Verify:** Hide window to tray (Cmd+W). Wait 60+ seconds. Create a notification for the user. Native popup still appears.

### Step 6: NotificationBell Real-Time Upgrade
**Files:** `NotificationBell.tsx`, `AdminNav.tsx` (add `teamMemberId` prop passthrough)
- Replace 30-second poll with `useQuery` subscriptions
- Pass `teamMemberId` from AdminNav to NotificationBell
- **Verify:** Open the app. Create a notification. Bell icon badge updates instantly (no 30-second delay). Open bell dropdown — notifications appear in real-time.

### Step 7: Permission Banner
**Files:** `NotificationPermissionBanner.tsx` (new), `app/admin/settings/notifications/page.tsx`
- Create the banner component
- Add to the settings page
- **Verify:** With notifications granted → green "enabled" banner. Deny in macOS settings → amber "disabled" banner with instructions.

### Step 8: Batch Testing
- Create a script or use the API to create 5+ notifications rapidly for the same user
- **Verify:** Single notification → individual popup. 3 rapid → 3 staggered popups. 5+ rapid → single summary "You have 5 new notifications"

### Step 9: Integration Testing
- Run through the full verification checklist below
- Test all Phase 1 + 2 + 3 features working together

---

## Verification Checklist

### Native Notifications
- [ ] Single notification appears as native macOS popup within ~1 second of creation
- [ ] Notification shows correct title and body text
- [ ] Notification plays default macOS notification sound
- [ ] App startup: existing notifications do NOT trigger native popups
- [ ] Page refresh: existing notifications do NOT trigger native popups

### Notification Click
- [ ] Click notification while app is visible → navigates to the link URL
- [ ] Click notification while app is in tray → window shows + focuses + navigates
- [ ] Click notification with no link → window shows + focuses (no navigation)

### Dock Badge
- [ ] Badge updates within ~1 second when notification is created
- [ ] Badge decrements when notification is marked read
- [ ] Badge clears (disappears) when all notifications are marked read
- [ ] Badge updates while window is hidden in tray

### Batch Handling
- [ ] 1 notification → individual native popup
- [ ] 2-3 rapid notifications → each shown individually with slight stagger
- [ ] 4+ rapid notifications → single summary: "You have N new notifications"

### Permission Flow
- [ ] First notification triggers macOS permission prompt (not app launch)
- [ ] Grant permission → notification appears immediately
- [ ] Deny permission → no native popup, no error, in-app bell still works
- [ ] Settings page shows green "enabled" banner when granted
- [ ] Settings page shows amber "disabled" banner when denied with instructions
- [ ] Browser users → no permission banner shown

### NotificationBell Real-Time
- [ ] Bell badge updates within ~1 second (no 30-second delay)
- [ ] Dropdown shows new notifications in real-time
- [ ] Mark read / mark all read / delete still work (API route mutations)
- [ ] Works in browser (non-Tauri) via Convex subscription

### Background Behavior
- [ ] Hide window to tray (Cmd+W) → notifications still appear as native popups
- [ ] Hide for 5+ minutes → notifications still appear (no WebView suspension)
- [ ] Badge updates while hidden

### Browser Compatibility
- [ ] NotificationBridge renders null in browser
- [ ] No console errors related to Tauri in browser
- [ ] NotificationBell works in browser with real-time Convex subscription
- [ ] NotificationPermissionBanner is hidden in browser

### Integration (with Phase 1-2)
- [ ] All Phase 1 functionality still works (login, navigation, file ops, external links)
- [ ] All Phase 2 functionality still works (menu bar, tray, deep links, window state)
- [ ] Notification → click → navigate → Cmd+W → tray notification → click → navigate (full lifecycle)
- [ ] No console errors related to Tauri in the WebView developer tools

---

## Risks & Mitigations (Phase 3 Specific)

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `tauri-plugin-notification` v2 API surface may differ from documented | Medium | Pin specific version in Cargo.toml. Test `on_action` and `extra` data early (Step 1). Fallback: encode link in notification `id` field and parse in handler |
| macOS rate-limits rapid notifications | Low | Batching mechanism (300ms window, summary for 4+) stays well within macOS limits (~5/sec). Stagger prevents coalescing |
| WebView suspended when hidden despite `backgroundThrottling: false` | Low | If observed, add a keep-alive timer in the WebView. Alternatively, move the Convex subscription to the Rust side (major architecture change — last resort) |
| Convex subscription cost (2 always-on queries per user) | Very Low | Both use indexed lookups (Convex's most efficient pattern). At ~10-20 team members, negligible load |
| `teamMemberId` as string cast to `Id<"teamMembers">` | Very Low | Existing pattern throughout codebase (lib/notifications.ts, hooks). Session stores the actual Convex document ID |
| NotificationBell refactor breaks existing functionality | Medium | Test mark-read, mark-all-read, delete thoroughly. Keep API route mutations (don't migrate mutations to Convex client-side yet) |
| macOS Focus mode suppresses notifications silently | Certain | No mitigation possible — user must configure Focus mode. Document in team onboarding |
| `on_action` extra data not supported in `tauri-plugin-notification` v2 | Low | Fallback: set notification `id` to `navigate:{link}`, parse the prefix in `on_action` handler |

---

## Estimated Output

After Phase 3 is complete:

- **3 new files** — `NotificationBridge.tsx`, `NotificationPermissionBanner.tsx`, `src-tauri/src/notifications.rs`
- **5 modified files** — `Cargo.toml`, `capabilities/default.json`, `tauri.conf.json`, `lib.rs`, `bridge.rs`
- **3 modified web app files** — `layout.tsx` (1 line), `NotificationBell.tsx` (polling → real-time), `settings/notifications/page.tsx` (1 line)
- **~10-15 MB** app size (unchanged from Phase 2 — notification plugin adds ~200KB)
- Notifications arrive in ~1 second instead of 30-second polling
- Dock badge updates in real-time
- Full macOS notification center integration with click-to-navigate
