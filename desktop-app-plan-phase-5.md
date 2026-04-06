# InsightPulse Desktop App — Phase 5: Enhanced Real-Time

## Goal

Migrate all remaining REST polling and one-time fetches to Convex real-time subscriptions. After Phase 5, every piece of live data in the app updates instantly via Convex's reactive system — no more `setInterval`, no more `fetch()` on mount, no more manual refetch triggers. The app feels alive: clock statuses, service boards, time trackers, and notification counts all sync across devices in under 1 second.

---

## What This Phase Delivers

- **Instant clock status sync** — AdminNav's clock indicator (idle/working/break/done/sick/vacation) updates in real-time via Convex subscription, replacing the 30-second polling interval
- **Real-time service board** — status changes, specialist assignments, and notes update live across all viewers — no page refresh needed for multi-user collaboration
- **Real-time service board summary** — the "My Board" progress banners on the home page update as entries change status
- **Real-time ticket time tracker** — time entries appear/update instantly when timers are started/stopped on any device
- **Removal of legacy polling hook** — `useClockStatusPoll` deleted entirely (replaced by existing Convex-based `useClockStatus`)
- **Elimination of manual refetch patterns** — no more `window.dispatchEvent(new CustomEvent("timerChange"))` or `clockStatusChange` event listeners

---

## Prerequisites

- Phase 1 complete — Tauri shell working
- Phase 2 complete — native macOS feel (menu, tray, dock badge, window state)
- Phase 3 complete — native push notifications with real-time Convex subscription
- Phase 4 complete — code signing, auto-updater, distribution
- NotificationBell is already on Convex real-time (done in Phase 3)
- FloatingTimerBar is already on Convex real-time (already uses `useQuery(api.timeEntries.getRunning)`)

---

## What's Already Real-Time (No Changes Needed)

Before diving into migrations, here's what's already optimal:

| Component | Convex Query | Status |
|-----------|-------------|--------|
| `NotificationBell.tsx` | `api.notifications.getUnreadCount` + `api.notifications.listByRecipient` | Real-time (Phase 3) |
| `FloatingTimerBar.tsx` | `api.timeEntries.getRunning` + local 1s counter | Real-time |
| `ServiceBoardDetailPanel.tsx` | `api.timeEntries.getRunning` | Real-time |
| `ActivityTracker.tsx` | `setInterval` for analytics batching | Not polling — keep as-is |

---

## Architecture: Before & After

### Before Phase 5

```
AdminNav clock status:
  setInterval(30s) → fetch(/api/admin/timesheet/status) → REST → Convex → response → setState

ServiceBoard:
  useEffect → fetch(/api/admin/service-board?category&month) → REST → Convex → response → setState
  (re-fetches on filter change, but NOT on external data changes)

ServiceBoardSummaryBanner:
  useEffect → fetch(/api/admin/service-board/my-summary) → REST → Convex → response → setState
  (fetches once on mount, never updates)

TimeTracker:
  useEffect → fetch(/api/admin/tickets/{id}/time) → REST → Convex → response → setState
  + window.addEventListener("timerChange") for manual refetch
```

### After Phase 5

```
AdminNav clock status:
  useClockStatus(teamMemberId) → useQuery(api.timesheetEntries.getActiveShift) → instant updates

ServiceBoard:
  useQuery(api.serviceBoardEntries.list, { category, month }) → instant updates on any change

ServiceBoardSummaryBanner:
  useQuery(api.serviceBoardEntries.getMySummary, { specialistId, month }) → instant updates

TimeTracker:
  useQuery(api.timeEntries.listByTicket, { ticketId }) → instant updates, no event listeners
```

---

## Project Structure After Phase 5

New and modified files shown. No Tauri/Rust changes.

```
insightpulse/
  hooks/
    useClockStatusPoll.ts                         # DELETED — replaced by useClockStatus.ts
    useClockStatus.ts                             # unchanged (already Convex-based)
  components/
    AdminNav.tsx                                  # MODIFIED — swap useClockStatusPoll → useClockStatus
    ServiceBoard.tsx                              # MODIFIED — fetch → useQuery
    ServiceBoardSummaryBanner.tsx                 # MODIFIED — fetch → useQuery
    TimeTracker.tsx                               # MODIFIED — fetch → useQuery, remove event listener
  convex/
    serviceBoardEntries.ts                        # MODIFIED — add getMySummary query
```

---

## File-by-File Specification

### 1. `hooks/useClockStatusPoll.ts` (Deleted)

**Current implementation (42 lines):**
- Polls `GET /api/admin/timesheet/status?_=${Date.now()}` every 30 seconds
- Listens for `clockStatusChange` custom window events for manual refetch
- Returns `{ clockStatus, loading, refetch }`

**Why delete:** The Convex-based replacement `useClockStatus` (in `hooks/useClockStatus.ts`) already exists and provides the same `ClockStatus` type via real-time Convex subscriptions:
- `useQuery(api.timesheetEntries.getActiveShift)` — active shift
- `useQuery(api.timesheetBreaks.getActiveBreak)` — active break
- `useQuery(api.timesheetBreaks.listByEntry)` — breaks for shift

The `useClockStatus` hook also includes all clock mutations (`clockIn`, `clockOut`, `startBreak`, `endBreak`, `markSickDay`) — making it a complete replacement, not just a read substitute.

**What gets removed:**
- The `setInterval(fetchStatus, 30000)` polling loop
- The `clockStatusChange` window event listener
- The manual `refetch` function
- The cache-busting query param hack (`?_=${Date.now()}`)

---

### 2. `components/AdminNav.tsx` (Modified — Lines 9, 31)

**Current:**
```tsx
import { useClockStatusPoll } from "@/hooks/useClockStatusPoll";
// ...
const { clockStatus, refetch } = useClockStatusPoll();
```

**After:**
```tsx
import { useClockStatus } from "@/hooks/useClockStatus";
// ...
// useClockStatus requires teamMemberId — AdminNav needs this as a new prop
const {
  clockStatus,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
} = useClockStatus(teamMemberId);
```

**Key changes:**
- Import switches from `useClockStatusPoll` to `useClockStatus`
- `teamMemberId` must be passed as a prop to AdminNav (from `app/admin/layout.tsx` which has the session)
- `refetch` is no longer needed — Convex subscriptions auto-update
- Clock action handlers (`handleNavClockAction`) can use the mutations directly from the hook instead of `fetch()` to API routes — **but per Phase 5 scope (reads only), mutations stay as REST calls for now**. The `refetch` call after mutations is simply removed since the Convex subscription will auto-update.
- Remove `window.dispatchEvent(new CustomEvent("clockStatusChange"))` — no longer needed since all consumers will be on Convex subscriptions

**AdminNav props change:**

```tsx
// Before
interface AdminNavProps {
  userName: string;
  roleLevel: RoleLevel;
  profilePicUrl: string | null;
}

// After
interface AdminNavProps {
  userName: string;
  roleLevel: RoleLevel;
  profilePicUrl: string | null;
  teamMemberId: string;  // NEW — needed by useClockStatus
}
```

**Layout change (`app/admin/layout.tsx`):**

```tsx
// Add teamMemberId to AdminNav props (already available from session)
<AdminNav
  userName={session.name}
  roleLevel={session.roleLevel}
  profilePicUrl={profilePicUrl}
  teamMemberId={session.teamMemberId}  // NEW
/>
```

---

### 3. `components/ServiceBoard.tsx` (Modified — Lines 101-118)

**Current (REST fetch):**
```tsx
const fetchEntries = useCallback(async () => {
  setLoading(true);
  try {
    const res = await fetch(`/api/admin/service-board?category=${category}&month=${month}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data);
    }
  } catch (e) {
    console.error("Failed to fetch service board:", e);
  } finally {
    setLoading(false);
  }
}, [category, month]);

useEffect(() => {
  fetchEntries();
}, [fetchEntries]);
```

**After (Convex real-time):**
```tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// Replace the entire fetchEntries + useEffect block with:
const rawEntries = useQuery(api.serviceBoardEntries.list, {
  category,
  month,
});
const entries = rawEntries ?? [];
const loading = rawEntries === undefined;
```

**What gets removed:**
- `fetchEntries` callback
- `useEffect` that calls `fetchEntries`
- `setEntries` state (replaced by query result)
- `setLoading` state (derived from `undefined` check)

**What stays:**
- All mutation calls (`handleStatusChange`, `handleSpecialistChange`, etc.) remain as REST `fetch()` calls — reads-only migration
- The `refetch` prop passed to `ServiceBoardDetailPanel` — no longer needed since the Convex subscription auto-updates. Remove the prop and any `onSaved={() => fetchEntries()}` callbacks.

**Type compatibility:** The existing `ServiceBoardEntry` type from `types/index.ts` must match the shape returned by `api.serviceBoardEntries.list`. The Convex query already enriches entries with `clientName`, `clientSlug`, `packageName`, `includedHours`, `specialistName`, `specialistColor`, `specialistProfilePicUrl` — these should align with the existing type. If there are minor differences (e.g., `_id` vs `id`), a lightweight mapping function handles the conversion.

---

### 4. `components/ServiceBoardSummaryBanner.tsx` (Modified — Lines 33-39)

**Current (REST fetch on mount):**
```tsx
useEffect(() => {
  fetch("/api/admin/service-board/my-summary")
    .then((r) => r.ok ? r.json() : { summaries: [] })
    .then((data: { summaries: BoardSummary[] }) => setSummaries(data.summaries))
    .catch(() => {})
    .finally(() => setLoading(false));
}, []);
```

**After (Convex real-time):**
```tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// Replace fetch with Convex subscription
const summaryData = useQuery(api.serviceBoardEntries.getMySummary, {
  specialistId,
  month: getCurrentMonth(),
});
const summaries = summaryData ?? [];
const loading = summaryData === undefined;
```

**Props change:** The component needs `specialistId` (the current user's team member ID). This comes from the session in the parent page.

```tsx
// Before
export default function ServiceBoardSummaryBanner() {

// After
export default function ServiceBoardSummaryBanner({ specialistId }: { specialistId: string }) {
```

The parent component (likely `app/admin/page.tsx` or similar home page) passes `session.teamMemberId`.

**What gets removed:**
- `useState` for `summaries` and `loading`
- `useEffect` with the fetch call
- Entire `fetch("/api/admin/service-board/my-summary")` pattern

---

### 5. `components/TimeTracker.tsx` (Modified — Lines 44-88)

**Current (REST fetch + event listener):**
```tsx
const fetchTimeData = useCallback(async () => {
  try {
    const res = await fetch(`/api/admin/tickets/${ticketId}/time`);
    if (res.ok) {
      const data = await res.json();
      const allEntries = (data.entries || []) as TimeEntry[];
      setEntries(allEntries);
      // ... derive running state from entries ...
    }
  } catch {}
}, [ticketId]);

useEffect(() => {
  fetchTimeData();
}, [fetchTimeData]);

// Manual refetch listener
useEffect(() => {
  function handleTimerChange() { fetchTimeData(); }
  window.addEventListener("timerChange", handleTimerChange);
  return () => window.removeEventListener("timerChange", handleTimerChange);
}, [fetchTimeData]);
```

**After (Convex real-time):**
```tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// Replace fetch + event listener with Convex subscription
const rawEntries = useQuery(api.timeEntries.listByTicket, {
  ticketId: ticketId as Id<"tickets">,
});
const entries = (rawEntries ?? []) as TimeEntry[];
const loading = rawEntries === undefined;

// Derive running state from entries (same logic as before, just reactive now)
const runningEntry = entries.find((e) => e.endTime === null);
const running = !!runningEntry;
const runningEntryId = runningEntry?.id ?? null;
const startTime = runningEntry?.startTime ?? null;

// Compute total from completed entries (same logic as before)
const totalSeconds = entries
  .filter((e) => e.endTime !== null)
  .reduce((sum, e) => {
    const start = new Date(e.startTime).getTime();
    const end = new Date(e.endTime!).getTime();
    return sum + Math.max(0, Math.round((end - start) / 1000));
  }, 0);
```

**What gets removed:**
- `fetchTimeData` callback
- Both `useEffect` blocks (fetch on mount + event listener)
- `window.addEventListener("timerChange", ...)` — no longer needed
- `setEntries`, `setRunning`, `setRunningEntryId`, `setStartTime`, `setTotalSeconds` states — derived from query

**What stays:**
- The `setInterval` for the live elapsed counter (lines 91-104) — this is a client-side UI counter, NOT polling
- All mutation handlers (`handleStart`, `handleStop`) remain as REST calls
- The `onTimerChange` callback prop — the parent can still react to timer changes, but it no longer needs to trigger refetches

**What changes for callers:** `ServiceTimeTracker` in `ServiceBoard.tsx` currently dispatches `window.dispatchEvent(new CustomEvent("timerChange"))` after start/stop. This can be removed since the Convex subscription auto-updates both the `TimeTracker` and `FloatingTimerBar`.

---

### 6. `convex/serviceBoardEntries.ts` (Modified — Add `getMySummary` query)

New Convex query that replaces the logic in `app/api/admin/service-board/my-summary/route.ts`.

```typescript
export const getMySummary = query({
  args: {
    specialistId: v.id("teamMembers"),
    month: v.string(), // "YYYY-MM-01"
  },
  handler: async (ctx, args) => {
    // Get all entries for this month where specialist matches
    // We query by month across categories, then filter by specialist
    const categories = ["seo", "google_ads"];

    const allEntries = [];
    for (const category of categories) {
      const entries = await ctx.db
        .query("serviceBoardEntries")
        .withIndex("by_category_month", (q) =>
          q.eq("category", category).eq("month", args.month)
        )
        .collect();
      allEntries.push(...entries);
    }

    // Filter to this specialist's entries only
    const myEntries = allEntries.filter(
      (e) => e.specialistId === args.specialistId
    );

    if (myEntries.length === 0) return [];

    // Get client names for enrichment
    const clientIds = [...new Set(myEntries.map((e) => e.clientId))];
    const clientMap = new Map<string, string>();
    for (const clientId of clientIds) {
      const client = await ctx.db.get(clientId);
      if (client) clientMap.set(clientId.toString(), client.name ?? "");
    }

    // Group by category
    const byCategory = new Map<
      string,
      {
        total: number;
        completed: number;
        clients: Array<{ id: string; name: string; status: string }>;
      }
    >();

    for (const entry of myEntries) {
      const cat = entry.category;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, { total: 0, completed: 0, clients: [] });
      }
      const group = byCategory.get(cat)!;
      group.total++;
      if (entry.status === "email_sent") {
        group.completed++;
      }
      group.clients.push({
        id: entry.clientId.toString(),
        name: clientMap.get(entry.clientId.toString()) || "Unknown",
        status: entry.status ?? "needs_attention",
      });
    }

    // Format month label
    const monthDate = new Date(args.month + "T12:00:00");
    const monthLabel = monthDate.toLocaleString("en-US", { month: "long" });

    return Array.from(byCategory.entries()).map(([category, data]) => ({
      category,
      categoryLabel:
        category === "google_ads"
          ? "Google Ads"
          : category === "seo"
            ? "SEO"
            : "Retainer",
      month: monthLabel,
      total: data.total,
      completed: data.completed,
      clients: data.clients,
    }));
  },
});
```

**Design decisions:**
- Queries by `by_category_month` index (efficient — hits 2 indexed queries for seo + google_ads)
- Filters `specialistId` in JS after index lookup (specialist is not in any index, but the set is small — typically 10-30 entries per category per month)
- Excludes "retainer" category (matching existing API route behavior)
- Returns the same shape as the existing REST endpoint to minimize frontend changes
- Real-time: any status change, specialist reassignment, or new entry triggers a subscription update

---

## Implementation Sequence

### Step 1: Add Convex Query — `getMySummary`
**Files:** `convex/serviceBoardEntries.ts`
- Add the `getMySummary` query (code above)
- **Verify:** Run `npx convex dev` — query syncs. Test in Convex dashboard:
  ```
  serviceBoardEntries.getMySummary({ specialistId: "<your-id>", month: "2026-04-01" })
  ```
  Should return the same data as `GET /api/admin/service-board/my-summary`.

### Step 2: Migrate AdminNav Clock Status
**Files:** `components/AdminNav.tsx`, `app/admin/layout.tsx`, delete `hooks/useClockStatusPoll.ts`
- Update AdminNav props to accept `teamMemberId`
- Replace `useClockStatusPoll()` import and call with `useClockStatus(teamMemberId)`
- Pass `teamMemberId={session.teamMemberId}` from layout
- Delete `hooks/useClockStatusPoll.ts`
- **Verify:** Clock indicator in AdminNav updates instantly when clocking in/out from another tab. No more 30-second delay.

### Step 3: Migrate ServiceBoard to Real-Time
**Files:** `components/ServiceBoard.tsx`
- Replace `fetchEntries` + `useEffect` with `useQuery(api.serviceBoardEntries.list, { category, month })`
- Remove `setEntries` / `setLoading` state management
- Remove `onSaved={() => fetchEntries()}` callbacks from detail panel
- **Verify:** Open service board in two windows. Change status in one → other updates instantly.

### Step 4: Migrate ServiceBoardSummaryBanner to Real-Time
**Files:** `components/ServiceBoardSummaryBanner.tsx`, parent page component
- Replace `fetch("/api/admin/service-board/my-summary")` with `useQuery(api.serviceBoardEntries.getMySummary, ...)`
- Add `specialistId` prop, pass from parent
- **Verify:** Summary banner on home page updates when service board entry status changes.

### Step 5: Migrate TimeTracker to Real-Time
**Files:** `components/TimeTracker.tsx`, `components/ServiceBoard.tsx` (ServiceTimeTracker)
- Replace `fetchTimeData` + event listener with `useQuery(api.timeEntries.listByTicket, { ticketId })`
- Derive `running`, `startTime`, `totalSeconds` from query result
- Remove `timerChange` event dispatching from `ServiceTimeTracker`
- Keep the `setInterval` for elapsed counter (local UI, not polling)
- **Verify:** Start timer on ticket detail → TimeTracker on service board updates instantly. Stop timer → both update.

### Step 6: Clean Up Event Listeners
**Files:** Various
- Search for and remove `window.dispatchEvent(new CustomEvent("timerChange"))` calls
- Search for and remove `window.dispatchEvent(new CustomEvent("clockStatusChange"))` calls
- Remove any remaining `window.addEventListener("timerChange", ...)` or `clockStatusChange` listeners
- **Verify:** All timer/clock features still work without manual event dispatching.

### Step 7: Integration Testing
- Run through the full verification checklist below
- Test all Phase 1-4 features still work

---

## Edge Cases & How They're Handled

| Scenario | Behavior | Why |
|----------|----------|-----|
| **Convex query returns `undefined`** | `loading = true`, show skeleton/spinner | Standard Convex pattern — `undefined` means query is still loading |
| **Network disconnection** | UI freezes at last known state | Convex auto-reconnects; subscription resumes with latest data on reconnect |
| **Multiple browser tabs + Tauri app** | All update simultaneously | Convex subscriptions are per-client; each tab/app has its own subscription |
| **Service board filter change (category/month)** | New query with new args, old data discarded | Convex treats new args as a new subscription — returns `undefined` briefly, then new data |
| **Rapid clock in/out** | Each state change reflected immediately | Convex mutations trigger subscription updates; `useClockStatus` derives status reactively |
| **TimeTracker with running timer — app reload** | Timer resumes from correct elapsed time | `startTime` comes from Convex (persistent); local counter recalculates diff on mount |
| **Two users editing same service board entry** | Both see updates instantly | Convex subscription is scoped to the query args (category + month), not the specific entry. Any row change in the result set triggers a re-evaluation |
| **ServiceBoardSummaryBanner with 0 assigned entries** | Returns empty array, component renders `null` | Same behavior as current REST version |
| **`useClockStatus` with no active shift** | Returns `clockStatus: "idle"` | `getActiveShift` returns `null` → `deriveClockStatus(null)` returns `"idle"` |
| **Stale shift from yesterday (forgot to clock out)** | `getActiveShift` scans back 7 days | Existing Convex query behavior — surfaces stale shifts for resolution |
| **Type mismatch between Convex `_id` and `id`** | Mapping layer in component | Service board entries use Convex `_id` (string). If the existing `ServiceBoardEntry` type uses numeric `id`, a lightweight `.map()` converts |
| **API routes still called by other code** | Routes remain functional | Phase 5 only changes client-side reads. API routes stay for any server-side callers, cron jobs, or Slack bot |

---

## What This Phase Changes

| File | Change | Browser Impact |
|------|--------|----------------|
| `hooks/useClockStatusPoll.ts` | DELETED | No more 30s polling — clock status is instant |
| `components/AdminNav.tsx` | Import + hook swap | Clock status updates in real-time instead of 30s delay |
| `components/ServiceBoard.tsx` | fetch → useQuery | Multi-user collaboration is now live |
| `components/ServiceBoardSummaryBanner.tsx` | fetch → useQuery + new prop | Progress bars update live |
| `components/TimeTracker.tsx` | fetch + event → useQuery | Timer state syncs across all views instantly |
| `convex/serviceBoardEntries.ts` | New `getMySummary` query | Enables real-time summary subscription |
| `app/admin/layout.tsx` | Pass `teamMemberId` to AdminNav | 1 line — provides prop for `useClockStatus` |

---

## What This Phase Does NOT Include

| Feature | Why deferred |
|---------|-------------|
| Migrating mutations to `useMutation` | Reads-only scope. REST mutations work fine and maintain server-side auth checks |
| Deleting API routes | Other consumers (cron jobs, Slack bot, scripts) may still use them |
| Service board WebSocket for collaborative editing | Convex subscriptions already provide sufficient multi-user sync |
| Offline support / optimistic updates | Deferred to Phase 6. Requires Convex offline story |
| Service board conflict resolution | At team size (~10-20), simultaneous edits to the same entry are unlikely. Convex's last-write-wins is acceptable |

---

## Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| Active polling intervals per user | 1 (30s clock status) | 0 |
| REST API calls on idle page (per minute) | 2 (clock poll) | 0 |
| REST API calls on page load | 1-3 (service board, summary, time tracker) | 0 |
| Data freshness — clock status | 0-30 second delay | Real-time (<100ms) |
| Data freshness — service board | Stale until page refresh | Real-time (<100ms) |
| Data freshness — time tracker | Stale until manual event | Real-time (<100ms) |
| Convex subscriptions per user (all phases) | ~4 (notifications x2, timer, clock x3) | ~8 (add service board, summary, time tracker) |
| Subscription cost | Negligible at 10-20 users | Negligible — all use indexed queries |

---

## Verification Checklist

### Clock Status (AdminNav)
- [ ] Clock indicator shows correct state on page load (idle/working/break/done/sick/vacation)
- [ ] Clock in from another tab/device → AdminNav updates within 1 second
- [ ] Start break → indicator changes to break state instantly
- [ ] End break → indicator changes to working state instantly
- [ ] Clock out → indicator changes to done state instantly
- [ ] No 30-second delay visible on any clock state transition
- [ ] `useClockStatusPoll.ts` is fully deleted, no import references remain

### Service Board
- [ ] Service board loads entries when navigating to the page
- [ ] Change category filter → entries update (brief loading state, then new data)
- [ ] Change month → entries update
- [ ] User A changes entry status → User B sees update within 1 second (no refresh)
- [ ] Assign specialist → all viewers see the assignment instantly
- [ ] Add/edit notes → reflected across viewers
- [ ] Detail panel opens and shows correct data
- [ ] Detail panel "save" works and board reflects change instantly (no manual refetch)

### Service Board Summary Banner
- [ ] Banner shows on home page with correct progress bars
- [ ] Complete an entry (set to "email_sent") → progress bar updates instantly
- [ ] Start a new entry → counts update
- [ ] User with no assigned entries → no banner shown
- [ ] Correct month displayed (current month)

### Time Tracker
- [ ] Time tracker shows correct entries on ticket detail page
- [ ] Start timer → play button changes to stop, elapsed counter begins
- [ ] Stop timer → entry appears in list, total updates
- [ ] Start timer on one device → TimeTracker on another device shows running state
- [ ] No `timerChange` event listeners remain in TimeTracker
- [ ] `ServiceTimeTracker` no longer dispatches `timerChange` events
- [ ] Live elapsed counter still works (1-second local interval)

### Integration (All Phases)
- [ ] All Phase 1 features work (login, navigation, file ops, external links)
- [ ] All Phase 2 features work (menu bar, tray, dock badge, window state, deep links)
- [ ] All Phase 3 features work (native notifications, notification click, badge sync)
- [ ] All Phase 4 features work (code signing, auto-update, DMG install)
- [ ] No console errors related to removed polling hooks or event listeners
- [ ] No orphaned `clockStatusChange` or `timerChange` event dispatches in codebase

### Performance
- [ ] No `setInterval` calls remain for data fetching (only local UI counters)
- [ ] Network tab shows no periodic REST polling on idle page
- [ ] Convex WebSocket connection stays alive and responsive

---

## Risks & Mitigations (Phase 5 Specific)

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `ServiceBoardEntry` type shape mismatch (Convex `_id` vs `id`) | Medium | Add a mapping layer in the component. Test with TypeScript strict mode to catch mismatches at build time |
| `useClockStatus` requires `teamMemberId` but AdminNav doesn't have it | Certain | Pass from layout via props (session already has it). One-line change in layout.tsx |
| Convex subscription count increases (4 → 8 per user) | Low risk | All queries use indexed lookups. At 10-20 team members, Convex handles this easily. Monitor via Convex dashboard |
| Removing `timerChange` events breaks something unexpected | Low | Grep codebase for all `timerChange` listeners/dispatchers. Verify each is covered by a Convex subscription |
| Service board summary Convex query is slower than REST route | Very Low | REST route already calls Convex under the hood. Direct subscription removes the HTTP round-trip — should be faster |
| Calendar-based `month` string format inconsistency | Low | Convex query expects "YYYY-MM-01". Ensure `getCurrentMonth()` helper is used consistently. Add validation if needed |

---

## Estimated Output

After Phase 5 is complete:

- **1 new Convex query** — `getMySummary` in `serviceBoardEntries.ts`
- **4 modified components** — `AdminNav.tsx`, `ServiceBoard.tsx`, `ServiceBoardSummaryBanner.tsx`, `TimeTracker.tsx`
- **1 modified layout** — `app/admin/layout.tsx` (pass `teamMemberId` to AdminNav)
- **1 deleted file** — `hooks/useClockStatusPoll.ts`
- **0 Tauri/Rust changes** — this is a purely frontend data layer migration
- **0 API routes deleted** — kept for backwards compatibility
- **0 new components** — all changes are to existing files
- Every piece of live data in the app updates via Convex real-time subscriptions
- Zero polling intervals remain (only local UI counters)
