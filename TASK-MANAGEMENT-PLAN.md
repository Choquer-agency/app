# Task Management System — Build Plan

> Break this into conversations. Copy the phase you want to work on and paste it as context.
> Each phase is self-contained: it lists exactly what to build, what files to create/modify, and how to verify it works.

---

## Overview

Replacing ClickUp with a built-in task management system. The full build is broken into **12 focused phases**, each small enough to complete in a single session.

**Tech stack:** Next.js 16, Vercel Postgres (raw SQL), Tailwind CSS 4, Vercel Blob, bcryptjs, Tiptap

**UI paradigm:** List view (table rows grouped by status), click to open 90% screen detail modal. NOT a Kanban board.

**Ticket numbering:** Global `CHQ-001` sequential IDs.

**Statuses (in order):**
1. `needs_attention` — Choquer Needs Attention
2. `stuck` — Stuck (red flag)
3. `in_progress` — In Progress
4. `qa_ready` — QA Ready
5. `client_review` — Client Review
6. `approved_go_live` — Approved / Go Live
7. `closed` — Closed

**Priorities:** `low`, `normal`, `high`, `urgent`

---

# PHASE 1: Team Member Authentication

**What:** Replace single admin password with individual email + password logins.

**Why this is first:** Every feature after this needs to know WHO is performing the action — creating tickets, logging time, leaving comments.

### Database Migration

File: `db/migrations/006_team_auth.sql`

```sql
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT '';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role_level VARCHAR(20) DEFAULT 'member';  -- 'admin' or 'member'
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
```

### NPM Install

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

### Files to Modify

**`lib/admin-auth.ts`**
- Update `createSession()` to store: `{ teamMemberId, name, email, roleLevel }` instead of just `{ pwd, name, email }`
- Update `getSession()` to return team member identity
- Add `hashPassword(plain)` and `verifyPassword(plain, hash)` using bcryptjs
- Add `getSessionTeamMember()` helper that returns full team member info from session

**`app/api/admin/login/route.ts`**
- Change from validating against `ADMIN_PASSWORD` env var to:
  1. Look up team member by email in `team_members` table
  2. Verify password with bcryptjs
  3. Check `active = true`
  4. Update `last_login` timestamp
  5. Create session with team member data

**`app/admin/login.tsx`**
- Keep email + password form (already has both fields)
- Remove any reference to shared password
- Show proper error messages: "Invalid email or password", "Account deactivated"

**`app/api/admin/team/route.ts`**
- Add `PUT` handler for setting/resetting passwords
- Admin-only: only `role_level = 'admin'` can set other people's passwords
- Endpoint: `PUT /api/admin/team/[id]/password` with `{ password }` body

**`components/AdminNav.tsx`**
- Show logged-in team member name from session (already shows `userName`, just wire it to session)

### Migration Path

1. Run migration to add columns
2. One-time setup: manually set Bryce as admin with a password via a setup script or API call
3. Admin (Bryce) sets passwords for other team members through team management UI
4. Keep `ADMIN_PASSWORD` env var as fallback during transition — if team member password_hash is empty, fall back to checking env var password

### Verification
- [ ] Log in as Bryce (admin) — see full admin access
- [ ] Log in as a team member — see ticket-related access
- [ ] Wrong password → error message
- [ ] Inactive team member → "Account deactivated"
- [ ] Admin can set/reset passwords for other team members
- [ ] Session persists across page refreshes (7-day cookie)

---

# PHASE 2: Tickets Database + Core API

**What:** Create the tickets and assignees tables, ticket CRUD library, and API routes. No UI yet — just the data layer.

### Database Migrations

File: `db/migrations/007_tickets.sql`

```sql
-- Ticket number sequence
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT '',
  description_format VARCHAR(10) DEFAULT 'plain',
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id INTEGER,  -- FK added later in Phase 10
  parent_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'choquer_needs_attention',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  ticket_group VARCHAR(100) DEFAULT '',
  ticket_type VARCHAR(30) DEFAULT 'actionable',
  role VARCHAR(100) DEFAULT '',
  start_date DATE,
  due_date DATE,
  due_time TIME,
  sort_order INTEGER DEFAULT 0,
  created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  archived BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(parent_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_due ON tickets(due_date);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_archived ON tickets(archived);
CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number);
```

File: `db/migrations/008_ticket_assignees.sql`

```sql
CREATE TABLE IF NOT EXISTS ticket_assignees (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticket_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_assignees_ticket ON ticket_assignees(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignees_member ON ticket_assignees(team_member_id);
```

### Files to Create

**`lib/tickets.ts`** — follows `lib/client-notes.ts` pattern (rowToX mapper + sql queries)
- `generateTicketNumber()` → `SELECT nextval('ticket_number_seq')` → format as `CHQ-001`
- `getTickets(filters)` → list with optional: clientId, status, priority, assigneeId, parentTicketId, archived, search query, groupBy, limit, offset
- `getTicketById(id)` → single ticket with assignees joined, client name, sub-ticket count, comment count
- `createTicket(data)` → auto-generates ticket_number, sets created_by_id from session
- `updateTicket(id, data)` → partial update, sets updated_at, auto-sets closed_at when status = 'closed'
- `archiveTicket(id)` → sets archived = true (soft delete)
- `restoreTicket(id)` → sets archived = false
- `getSubTickets(parentTicketId)` → child tickets
- `getTicketsByClient(clientId)` → for client profile
- `getTicketsByAssignee(teamMemberId)` → for "my tickets"
- `addAssignee(ticketId, teamMemberId)`
- `removeAssignee(ticketId, teamMemberId)`
- `bulkUpdateStatus(ticketIds, newStatus)`
- `bulkUpdatePriority(ticketIds, newPriority)`
- `bulkUpdateAssignee(ticketIds, teamMemberId, action: 'add' | 'remove')`
- `searchTickets(query)` → searches ticket_number, title via ILIKE

**`types/index.ts`** (modify) — add:
```typescript
export type TicketStatus = 'choquer_needs_attention' | 'stuck' | 'in_progress' | 'qa_ready' | 'client_review' | 'approved_go_live' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  descriptionFormat: 'tiptap' | 'plain';
  clientId: number | null;
  projectId: number | null;
  parentTicketId: number | null;
  status: TicketStatus;
  priority: TicketPriority;
  ticketGroup: string;
  ticketType: string;
  role: string;
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  sortOrder: number;
  createdById: number | null;
  archived: boolean;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  clientName?: string;
  createdByName?: string;
  assignees?: TicketAssignee[];
  subTicketCount?: number;
  commentCount?: number;
  totalTimeSeconds?: number;
}

export interface TicketAssignee {
  id: number;
  ticketId: number;
  teamMemberId: number;
  assignedAt: string;
  memberName?: string;
  memberEmail?: string;
  memberColor?: string;
  memberProfilePicUrl?: string;
}
```

### API Routes

**`app/api/admin/tickets/route.ts`**
- `GET` — list tickets with query params: clientId, status, priority, assigneeId, parentTicketId, archived, search, groupBy, page, limit
- `POST` — create ticket (requires auth session for created_by_id)

**`app/api/admin/tickets/[id]/route.ts`**
- `GET` — single ticket with all joined data
- `PUT` — update ticket fields
- `DELETE` — archive ticket (NOT permanent delete)

**`app/api/admin/tickets/[id]/assignees/route.ts`**
- `GET` — list assignees
- `POST` — add assignee `{ teamMemberId }`
- `DELETE` — remove assignee `{ teamMemberId }`

**`app/api/admin/tickets/bulk/route.ts`**
- `PUT` — bulk update `{ ticketIds, action, value }` where action is 'status' | 'priority' | 'assignee'

**`app/api/admin/tickets/search/route.ts`**
- `GET` — search `?q=homepage+banner`

### Verification
- [ ] Create ticket via API → returns with CHQ-001 number
- [ ] Create second ticket → CHQ-002
- [ ] List tickets → returns both
- [ ] Update status → updated_at changes, setting 'closed' auto-sets closed_at
- [ ] Archive ticket → disappears from default list, appears with `?archived=true`
- [ ] Add/remove assignees → works correctly
- [ ] Search by title and ticket number
- [ ] Bulk update 3 tickets' status at once
- [ ] Create sub-ticket with parent_ticket_id

---

# PHASE 3: Ticket Activity Log

**What:** Log every mutation to a ticket for audit trail and the combined timeline in the detail modal.

### Database Migration

File: `db/migrations/009_ticket_activity.sql`

```sql
CREATE TABLE IF NOT EXISTS ticket_activity (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  actor_name VARCHAR(200) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  old_value VARCHAR(500),
  new_value VARCHAR(500),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_created ON ticket_activity(created_at DESC);
```

**Action types:** `created`, `status_change`, `priority_change`, `assigned`, `unassigned`, `due_date_change`, `description_updated`, `comment_added`, `time_logged`, `attachment_added`, `archived`, `restored`

### Files to Create

**`lib/ticket-activity.ts`**
- `logActivity(ticketId, actorId, actorName, actionType, oldValue?, newValue?, metadata?)` — insert activity record
- `getTicketActivity(ticketId, limit?, offset?)` — chronological feed for detail sidebar

### Files to Modify

**`lib/tickets.ts`** — after every mutation, call `logActivity()`:
- `createTicket()` → log `created`
- `updateTicket()` → log `status_change` (with old → new), `priority_change`, `due_date_change`, `description_updated` as appropriate
- `archiveTicket()` → log `archived`
- `restoreTicket()` → log `restored`
- `addAssignee()` → log `assigned` (new_value = team member name)
- `removeAssignee()` → log `unassigned`

**`app/api/admin/tickets/[id]/activity/route.ts`**
- `GET` — returns combined activity feed (later phases will interleave comments and time entries into this)

### Verification
- [ ] Create ticket → activity shows "created this ticket"
- [ ] Change status → activity shows "changed status from X to Y"
- [ ] Add assignee → activity shows "assigned Lauren Davies"
- [ ] GET activity for ticket → returns chronological list

---

# PHASE 4: Ticket List View UI

**What:** The main `/admin/tickets` page with the list view, status grouping, filters, and bulk actions. No detail modal yet — that's Phase 5.

### UI Spec (matches ClickUp screenshots)

**Layout:**
- Top: Filter bar (client dropdown, assignee dropdown, priority dropdown, search input, grouping toggle)
- Below: Table with collapsible status group headers
- Each group header: colored status pill + count (e.g., "CHOQUER NEEDS ATTENTION — 27")
- Table columns: Checkbox, Name, Comments (count icon), Client, Status, Time tracked, Assignee(s), Due date, Priority, Created by
- Overdue dates in red text
- Checkbox column for bulk select → floating bulk action bar appears at bottom

**Grouping options:** Status (default), Assignee, Priority, Client

**Mobile:** Cards instead of table rows, stacked vertically. Each card shows: title, status badge, client, due date, priority flag, assignee avatar(s).

### Files to Create

**`app/admin/tickets/page.tsx`**
- Server component that fetches initial tickets
- Renders TicketListView

**`components/TicketListView.tsx`**
- Main container: filter bar + grouped table
- State: filters (client, assignee, priority, search), groupBy, selectedTicketIds
- Fetches tickets from API with current filters
- Groups tickets by selected groupBy field
- Renders collapsible groups with TicketListRow for each ticket

**`components/TicketListRow.tsx`**
- Single table row with all columns
- Checkbox for bulk select
- Clickable row → opens detail modal (wired in Phase 5, for now just selects)
- Assignee avatars (up to 3 shown, +N for more)
- Due date with overdue styling

**`components/TicketStatusBadge.tsx`**
- Colored pill matching ClickUp style:
  - choquer_needs_attention → orange
  - stuck → red
  - in_progress → blue
  - qa_ready → purple
  - client_review → yellow
  - approved_go_live → green
  - closed → gray

**`components/TicketPriorityBadge.tsx`**
- Flag icon with color: low (gray), normal (blue), high (orange), urgent (red)

**`components/TicketAssigneeAvatars.tsx`**
- Stacked circular avatars (profile pic or initials with color)
- "+2" overflow indicator

**`components/TicketFilters.tsx`**
- Row of dropdowns + search input + group-by toggle
- Fetches clients list and team members list for dropdowns
- Search is debounced (300ms)

**`components/TicketBulkActions.tsx`**
- Fixed bottom bar, appears when 1+ tickets selected
- Actions: Change Status (dropdown), Change Priority (dropdown), Assign To (dropdown)
- "X selected" count + "Clear" button

**`components/AdminNav.tsx`** (modify)
- Add "Tickets" to NAV_LINKS array

### Verification
- [ ] Navigate to /admin/tickets → see list grouped by status
- [ ] Tickets with overdue dates show red
- [ ] Filter by client → list updates
- [ ] Filter by assignee → list updates
- [ ] Search "CHQ-003" → finds ticket
- [ ] Toggle grouping to "Assignee" → re-groups
- [ ] Select 3 tickets → bulk bar appears → change status → all 3 update
- [ ] Mobile viewport → cards instead of table
- [ ] Empty state when no tickets exist

---

# PHASE 5: Ticket Detail Modal

**What:** The 90% screen coverage modal that opens when clicking a ticket row. Two-column layout: content on left, activity on right.

### UI Spec (matches ClickUp ticket detail screenshot)

**Modal:**
- 90% width, 95% height, centered, dark overlay behind
- Full-screen on mobile
- Close via X button or clicking overlay

**Left Column (main content):**
- Top: Ticket type label ("Task"), ticket number (CHQ-142)
- Title: large, editable inline
- Metadata grid (2 columns):
  - Status → dropdown to change
  - Assignees → avatar(s) + "+" button to add
  - Dates → Start date → Due date pickers
  - Priority → dropdown
  - Time tracked → total time display
  - Track time → play/pause button (wired in Phase 7)
  - Client → linked client name
- Description area: plain textarea (Tiptap comes in Phase 8)
- Sub-tickets section (if parent): list of child tickets, each clickable, "Add sub-ticket" button

**Right Column (Activity sidebar):**
- Header: "Activity" with count
- Scrollable feed: activity entries from ticket_activity table
  - "Bryce created this ticket — 11:49 am"
  - "Bryce set priority to Normal — 11:49 am"
  - "Lauren changed status from In Progress to QA Ready — 2:30 pm"
- Comment input at bottom: "Write a comment..." textarea (comments wired in Phase 8)

### Files to Create

**`components/TicketDetailModal.tsx`**
- Overlay + modal container
- Fetches ticket by ID with all joined data + activity feed
- Two-column layout
- Close handler (escape key, overlay click, X button)
- Full-screen on mobile

**`components/TicketDetailContent.tsx`**
- Left column: title (inline editable), metadata grid, description, sub-tickets
- Inline edit: click title to edit, blur or Enter to save
- Status/priority dropdowns that call PUT API on change
- Date pickers for start_date and due_date
- Assignee management: show current + "+" to add from team member list

**`components/TicketActivitySidebar.tsx`**
- Right column: scrollable activity feed
- Each entry: actor name, action description, relative timestamp
- Color-coded action types (status changes, assignments, etc.)
- Auto-scrolls to bottom

**`components/TicketListView.tsx`** (modify)
- Clicking a row opens TicketDetailModal with that ticket's ID
- URL updates to `/admin/tickets?selected=CHQ-142` (preservable link)

### Verification
- [ ] Click ticket row → modal opens at 90% coverage
- [ ] See ticket number, title, all metadata
- [ ] Change status via dropdown → saves, activity entry appears in sidebar
- [ ] Change priority → saves, activity logs
- [ ] Add assignee → saves, activity logs
- [ ] Edit title inline → saves on blur
- [ ] Change due date → saves, activity logs
- [ ] See activity timeline in right sidebar
- [ ] Close via X, Escape, or overlay click
- [ ] Sub-tickets listed if parent ticket
- [ ] Mobile: modal goes full-screen
- [ ] URL includes selected ticket (shareable link)

---

# PHASE 6: Create Ticket + Sub-Tickets

**What:** New ticket creation flow + ability to create sub-tickets from within a parent ticket.

### UI Spec

**Create Ticket:** Two options:
1. "+ Ticket" button at top of list view → opens the detail modal in "create mode" (empty fields)
2. Inline quick-add at the bottom of each status group → just a title field, creates with that status

**Create Sub-Ticket:**
- Inside a ticket detail modal's sub-ticket section → "Add sub-ticket" button
- Opens a mini-form or new detail modal with `parent_ticket_id` pre-set
- Sub-tickets inherit client_id from parent

### Files to Create/Modify

**`components/TicketCreateModal.tsx`**
- Same layout as TicketDetailModal but all fields are empty/editable
- Required: title
- Optional: client, status, priority, assignees, due date, description
- On save: calls POST /api/admin/tickets, then opens the created ticket in detail modal

**`components/TicketQuickAdd.tsx`**
- Inline row at bottom of each status group
- Just a text input + Enter to create
- Creates ticket with just title + that group's status
- Animated appearance of new row

**`components/TicketDetailContent.tsx`** (modify)
- Sub-tickets section: list + "Add sub-ticket" button
- "Add sub-ticket" opens TicketCreateModal with parent_ticket_id pre-filled

### Verification
- [ ] Click "+ Ticket" → create modal opens → fill fields → save → ticket appears in list
- [ ] New ticket has CHQ-XXX number auto-assigned
- [ ] Quick add: type title in inline input → Enter → ticket created in that status group
- [ ] "Add sub-ticket" from parent → creates with parent_ticket_id set
- [ ] Sub-ticket appears in parent's sub-ticket list
- [ ] Sub-ticket inherits parent's client_id

---

# PHASE 7: Time Tracking

**What:** Play/pause timer, manual time entry, monthly hour splitting, runaway timer protection, hour cap alerts.

### Database Migration

File: `db/migrations/010_time_entries.sql`

```sql
CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  is_manual BOOLEAN DEFAULT false,
  note VARCHAR(500) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_ticket ON time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_member ON time_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_running ON time_entries(end_time) WHERE end_time IS NULL;
```

### Key Design: Month-Boundary Splitting

Entries store raw start/end timestamps. Monthly aggregation clamps at month boundaries:

```sql
SELECT DATE_TRUNC('month', GREATEST(te.start_time, $month_start)) AS month,
  SUM(EXTRACT(EPOCH FROM LEAST(te.end_time, $month_end) - GREATEST(te.start_time, $month_start)) / 3600.0) AS hours
FROM time_entries te JOIN tickets t ON t.id = te.ticket_id
WHERE t.client_id = $client_id AND te.end_time IS NOT NULL
  AND te.start_time < $month_end AND te.end_time > $month_start
GROUP BY 1;
```

### Rules
- One running timer per team member at a time (starting new → auto-stops previous)
- Runaway protection: if timer running > 10 hours, flag for review (cron or on-login check)
- Hour cap: when client's monthly hours reach 80% → warning, 100% → alert

### Files to Create

**`lib/time-entries.ts`**
- `startTimer(ticketId, teamMemberId)` — auto-stop any running timer first, insert with end_time=NULL
- `stopTimer(entryId)` — set end_time=NOW(), compute duration_seconds
- `getRunningTimer(teamMemberId)` — WHERE end_time IS NULL
- `addManualEntry(ticketId, teamMemberId, date, startTime, endTime, note)` — is_manual=true
- `editTimeEntry(entryId, startTime, endTime, note)` — for correcting runaway timers
- `deleteTimeEntry(entryId)`
- `getTimeEntriesForTicket(ticketId)`
- `getMonthlyHoursForClient(clientId, month)` — the GREATEST/LEAST query
- `getMonthlyHoursForMember(teamMemberId, month)`
- `getTeamTimeReport(period: 'week' | 'month')` — all members, all clients
- `checkRunawayTimers()` — find entries running > 10 hours
- `getClientHourCap(clientId, month)` — compare logged vs. package hours_included

**API Routes:**
- `app/api/admin/tickets/[id]/time/route.ts` — GET entries, POST start/manual
- `app/api/admin/tickets/[id]/time/[entryId]/route.ts` — PUT, DELETE
- `app/api/admin/time/running/route.ts` — GET current running timer
- `app/api/admin/time/report/route.ts` — GET team-wide report
- `app/api/admin/clients/[id]/hours/route.ts` — GET monthly summary + cap status

### UI Components

**`components/TimeTracker.tsx`**
- In ticket detail modal metadata row
- States: idle (play button), running (pause button + live counter), stopped
- Starting auto-stops any other running timer
- Clicking time total opens time entry list

**`components/TimeEntryList.tsx`**
- Expandable section in ticket detail
- Each entry: team member name, date, duration, note, edit/delete buttons
- Manual entries tagged with icon

**`components/ManualTimeEntry.tsx`**
- Form: date picker, start time, end time (or just duration), optional note
- "Add time" button in time entry list

**`components/ClientHoursSummary.tsx`**
- For client profile tabs
- Monthly progress bar: logged hours / included hours
- Color: green (under 80%), yellow (80-99%), red (100%+)
- Breakdown by ticket

**`components/AdminNav.tsx`** (modify)
- Running timer indicator: small pulsing dot + ticket number when timer is active

### Verification
- [ ] Press play on ticket → timer starts, counter ticks
- [ ] Press pause → timer stops, time entry created
- [ ] Start timer on ticket A while timer running on ticket B → B auto-stops
- [ ] Add manual entry "2 hours yesterday" → appears in list
- [ ] Edit a time entry's end time → duration recalculates
- [ ] Monthly report: ticket spanning March→April splits correctly
- [ ] Client hours at 80% → visual warning
- [ ] Running timer shows in AdminNav
- [ ] Team time report shows all members' hours

---

# PHASE 8: Rich Text Editor, Comments & Attachments

**What:** Tiptap for descriptions, comment threads, file uploads.

### NPM Install

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-placeholder @tiptap/extension-link
```

### Database Migrations

File: `db/migrations/011_ticket_comments.sql`
```sql
CREATE TABLE IF NOT EXISTS ticket_comments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_type VARCHAR(10) NOT NULL DEFAULT 'team',
  author_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  author_name VARCHAR(200) NOT NULL,
  author_email VARCHAR(255) DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
```

File: `db/migrations/012_ticket_attachments.sql`
```sql
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  file_name VARCHAR(500) NOT NULL,
  file_url VARCHAR(1000) NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
```

### Files to Create

**`components/TiptapEditor.tsx`**
- `"use client"` + `next/dynamic({ ssr: false })`
- Props: `content` (JSON), `onChange` callback, `editable` boolean
- Extensions: StarterKit (headings H1-H3, bold, italic, lists, code, blockquote), TaskList, TaskItem, Table, Placeholder, Link
- Floating toolbar on text selection (Notion-style): bold, italic, heading toggles, list toggles, link, code
- Stores/retrieves as JSON via `editor.getJSON()`

**`components/TiptapRenderer.tsx`**
- Read-only Tiptap instance for displaying saved content
- Used in client-facing views

**`lib/ticket-comments.ts`**
- `getComments(ticketId)` — all comments for ticket
- `addComment(ticketId, authorType, authorId, authorName, content)` — also calls `logActivity('comment_added')`
- `updateComment(commentId, content)`
- `deleteComment(commentId)`

**`lib/ticket-attachments.ts`**
- `uploadAttachment(ticketId, uploadedById, file)` — upload to Vercel Blob, save record
- `getAttachments(ticketId)`
- `deleteAttachment(id)` — delete from Blob + DB

**API Routes:**
- `app/api/admin/tickets/[id]/comments/route.ts` — GET, POST
- `app/api/admin/tickets/[id]/comments/[commentId]/route.ts` — PUT, DELETE
- `app/api/admin/tickets/[id]/attachments/route.ts` — GET, POST (multipart)
- `app/api/admin/tickets/[id]/attachments/[attachmentId]/route.ts` — DELETE

**`components/TicketComments.tsx`**
- Comment thread within the Activity sidebar
- Each comment: author avatar, name, timestamp, content, edit/delete (own comments only)
- "Write a comment..." input at bottom with attach file button

**`components/FileUpload.tsx`**
- Drag-and-drop zone + click to browse
- Shows upload progress
- Preview for images, icon for other file types

**`components/AttachmentList.tsx`**
- Grid/list of attached files
- Image thumbnails, file name + size for others
- Click to open/download, X to delete

### Modify

**`components/TicketDetailContent.tsx`**
- Replace textarea with TiptapEditor for description
- Add attachments section below description

**`components/TicketActivitySidebar.tsx`**
- Interleave comments into the activity timeline (comments between activity entries, sorted by timestamp)
- Comment input at bottom

### Verification
- [ ] Rich text editor: type with headings, bold, lists, checkboxes, tables, links
- [ ] Save description → reload → content preserved with formatting
- [ ] Add comment → appears in activity sidebar
- [ ] Edit own comment → updates
- [ ] Upload image → preview shows in attachments
- [ ] Upload PDF → file icon shows, clickable to download
- [ ] Drag file onto ticket detail → uploads
- [ ] Activity sidebar shows comments interleaved with status changes etc.

---

# PHASE 9: Notifications

**What:** In-app notification system with bell icon, triggered by assignments, status changes, comments, due dates.

### Database Migration

File: `db/migrations/013_notifications.sql`
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  body VARCHAR(500) DEFAULT '',
  link VARCHAR(500) DEFAULT '',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
```

### Notification Types & Triggers

| Type | Trigger | Recipients |
|------|---------|------------|
| `assigned` | Team member added to ticket | The assigned member |
| `status_change` | Ticket status changed | Creator + all assignees (except actor) |
| `comment` | New comment on ticket | Creator + all assignees (except commenter) |
| `due_soon` | Ticket due within 24 hours | All assignees |
| `overdue` | Ticket past due date | All assignees + creator |
| `hour_cap_warning` | Client at 80% monthly hours | Admin users |
| `hour_cap_exceeded` | Client at 100%+ monthly hours | Admin users + ticket assignees |
| `runaway_timer` | Timer running > 10 hours | Timer owner |

### Files to Create

**`lib/notifications.ts`**
- `createNotification(recipientId, ticketId, type, title, body, link)`
- `createBulkNotifications(recipientIds, ...)` — for notifying multiple people
- `getUnreadCount(recipientId)`
- `getNotifications(recipientId, limit, offset)` — all, newest first
- `markRead(notificationId)`
- `markAllRead(recipientId)`

**`app/api/admin/notifications/route.ts`** — GET (list), PUT (mark read)
**`app/api/cron/notifications/route.ts`** — cron job for due_soon, overdue, runaway checks

**`components/NotificationBell.tsx`**
- Bell icon in AdminNav
- Red badge with unread count
- Click → dropdown panel with notification list
- Each notification: icon, title, body, relative time, click to navigate
- "Mark all as read" link at top

**`components/NotificationList.tsx`**
- Scrollable list of notifications
- Unread items have subtle background highlight
- Click marks as read + navigates to ticket

### Modify

**`lib/tickets.ts`** — after status change, assignment → create notifications
**`lib/ticket-comments.ts`** — after comment → create notifications
**`lib/time-entries.ts`** — after hour cap check → create notifications
**`components/AdminNav.tsx`** — add NotificationBell component

### Verification
- [ ] Assign ticket to Lauren → Lauren sees notification
- [ ] Change status → creator + assignees notified
- [ ] Add comment → participants notified
- [ ] Bell shows unread count
- [ ] Click notification → navigates to ticket
- [ ] Mark all read → count goes to 0
- [ ] Cron: ticket due tomorrow → assignees get "due soon" notification
- [ ] Timer running 11 hours → owner gets "runaway timer" notification

---

# PHASE 10: Projects & Templates

**What:** Group tickets into projects, template system, duplicate templates with auto-scheduling.

### Database Migrations

File: `db/migrations/014_projects.sql`
```sql
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  description TEXT DEFAULT '',
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  is_template BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  archived BOOLEAN DEFAULT false,
  start_date DATE,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_template ON projects(is_template);

ALTER TABLE tickets ADD CONSTRAINT fk_tickets_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS day_offset_start INTEGER;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS day_offset_due INTEGER;

CREATE TABLE IF NOT EXISTS ticket_dependencies (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  depends_on_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  UNIQUE(ticket_id, depends_on_ticket_id)
);
```

### Template Duplication Algorithm
1. Fetch template project + all its tickets + sub-tickets + assignees + dependencies
2. Create new project: `is_template=false`, linked to client, start_date from user input
3. For each ticket in template (ordered by sort_order):
   - Clone ticket with new project_id, client_id
   - Calculate start_date = project.start_date + day_offset_start
   - Calculate due_date = project.start_date + day_offset_due
   - Map old ticket ID → new ticket ID
4. Clone sub-tickets, remap parent_ticket_id using ID map
5. Clone assignees using ID map
6. Clone dependencies using ID map

### Seed Data

File: `db/seed-website-template.sql` — the full website onboarding template with 4 groups (Kick Off, Wireframe, Development, Launch), ~60 tickets, day offsets, roles, and dependencies extracted from the ClickUp export.

### Files to Create

**`lib/projects.ts`**
- `getProjects(filters)` — list with clientId, isTemplate, archived filters
- `getProjectById(id)` — with ticket count, % complete, client name
- `createProject(data)`
- `updateProject(id, data)`
- `archiveProject(id)`
- `duplicateProject(templateId, clientId, name, startDate)` — the full clone algorithm

**API Routes:**
- `app/api/admin/projects/route.ts` — GET, POST
- `app/api/admin/projects/[id]/route.ts` — GET, PUT, DELETE (archive)
- `app/api/admin/projects/[id]/duplicate/route.ts` — POST

**`app/admin/projects/page.tsx`** — project list with template section
**`app/admin/projects/[id]/page.tsx`** — project detail (ticket list scoped to project)

**`components/ProjectList.tsx`** — project cards with progress bar (% tickets closed)
**`components/ProjectDetailView.tsx`** — project header + full ticket list view scoped to project
**`components/ProjectTemplateSelector.tsx`** — choose template when creating project
**`components/AdminNav.tsx`** (modify) — add "Projects" to nav

### Verification
- [ ] Create project manually → appears in list
- [ ] Create template → marked as template
- [ ] Duplicate template for client → all ~60 tickets cloned with correct dates
- [ ] Sub-tickets maintain parent-child relationship in clone
- [ ] Dependencies preserved
- [ ] Progress bar shows correct % completion
- [ ] Archive project → hidden from default view, preserved in DB

---

# PHASE 11: Recurring Tickets

**What:** Auto-create tickets on a schedule for retainer clients (monthly reporting, check-ins, audits).

### Database Migration

File: `db/migrations/015_recurring.sql`
```sql
CREATE TABLE IF NOT EXISTS recurring_ticket_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT DEFAULT '',
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  status_on_create VARCHAR(30) DEFAULT 'choquer_needs_attention',
  priority VARCHAR(10) DEFAULT 'normal',
  role VARCHAR(100) DEFAULT '',
  assignee_ids INTEGER[] DEFAULT '{}',
  recurrence_rule VARCHAR(50) NOT NULL,
  recurrence_day INTEGER DEFAULT 1,
  next_create_at DATE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Recurrence Rules
- `monthly` — creates on recurrence_day (1-28) each month
- `weekly` — creates on recurrence_day (0=Sun, 6=Sat) each week
- `biweekly` — every 2 weeks on recurrence_day
- `quarterly` — every 3 months on recurrence_day

### Files to Create

**`lib/recurring-tickets.ts`**
- `getRecurringTemplates(clientId?)`
- `createRecurringTemplate(data)`
- `updateRecurringTemplate(id, data)`
- `deleteRecurringTemplate(id)`
- `processRecurringTickets()` — check all active templates where next_create_at <= today, create tickets, advance next_create_at

**`app/api/admin/recurring/route.ts`** — GET, POST
**`app/api/admin/recurring/[id]/route.ts`** — PUT, DELETE
**`app/api/cron/recurring/route.ts`** — cron job: calls processRecurringTickets()

**`components/RecurringTicketManager.tsx`** — CRUD interface for recurring templates, accessible from client profile or settings

### Verification
- [ ] Create recurring template: "Monthly SEO Report" for client, monthly on day 1
- [ ] Run cron → ticket created with correct title, client, priority, assignees
- [ ] next_create_at advances to next month
- [ ] Pause template → no tickets created on next run
- [ ] Weekly template → creates every correct weekday

---

# PHASE 12: Home Dashboard & Client-Facing View

**What:** Personalized home screen for team members + client-facing ticket view with comment capability.

### Home Dashboard (`/admin` → no longer redirects to clients)

**`app/admin/page.tsx`** (modify)
- Render HomeDashboard component instead of redirecting

**`components/HomeDashboard.tsx`**
- **Running Timer** — if active, show ticket title + live counter + stop button
- **My Tickets** — tickets assigned to current user, grouped by status (non-closed)
- **Overdue** — red section: assigned tickets past due
- **Due Soon** — yellow section: assigned tickets due within 48 hours
- **Recent Activity** — last 20 activity entries across user's tickets
- **Team Hours This Week** — bar chart by team member (admin only)
- **Unread Notifications** — top 5 with "View all" link

### Client-Facing Ticket View

**`app/api/clients/[slug]/tickets/route.ts`**
- Public endpoint (no admin auth): returns non-archived tickets for this client
- Limited fields: ticket_number, title, status, priority, assignees (names only), due_date

**`app/api/clients/[slug]/tickets/[ticketNumber]/route.ts`**
- Single ticket detail for client view
- Includes: title, description (rendered), status, attachments, comments

**`app/api/clients/[slug]/tickets/[ticketNumber]/comments/route.ts`**
- POST: client can add comment (author_type = 'client', author_name from client contact)
- Only allowed when ticket status is 'client_review'

**`components/ClientTicketsDashboard.tsx`**
- Section on client dashboard showing their active tickets
- Grouped by status, simplified view
- Click ticket → ClientTicketDetail modal

**`components/ClientTicketDetail.tsx`**
- Simplified detail view (no editing except comments)
- Shows: title, status badge, description, attachments, activity/comments
- Comment form at bottom (enabled only when status = client_review)

**`app/[slug]/page.tsx`** (modify) — add ClientTicketsDashboard section

### Client Profile Integration

**`components/ClientProfileTabs.tsx`** (modify) — add "Tickets" and "Hours" tabs
**`components/ClientTicketsPanel.tsx`** — all tickets for this client in admin view
**`components/ClientHoursSummary.tsx`** — already built in Phase 7, wire into tab

### Verification
- [ ] Login → see home dashboard with my tickets, overdue, recent activity
- [ ] Running timer shows on home dashboard
- [ ] Admin sees team hours chart
- [ ] Client dashboard shows their tickets
- [ ] Client clicks ticket → sees detail with description and comments
- [ ] Client adds comment on "Client Review" ticket → appears in team's activity sidebar
- [ ] Client cannot comment on non-Client Review tickets
- [ ] Client profile in admin → "Tickets" tab shows all tickets, "Hours" tab shows monthly summary

---

# PHASE 13: Reporting & Analytics

**What:** Dashboards for team utilization, client profitability, ticket velocity, and individual performance metrics.

**Why:** Agency needs data for capacity planning, pricing decisions, and performance reviews. Currently no visibility into where hours go or how fast tickets move through the pipeline.

### Reports

**Team Utilization**
- Hours logged per team member per week/month
- Utilization rate = logged hours / available hours (configurable per member, default 40h/week)
- Bar chart: each member's logged hours, color-coded by client
- Time period selector: this week, last week, this month, last month, custom range

**Client Profitability**
- Hours logged vs. hours included in package per client
- Overage tracking: how many hours over/under each month
- Table: client name, package hours, logged hours, overage, overage cost
- Trend chart: monthly hours over last 6 months per client

**Ticket Velocity**
- Average time from creation → close, grouped by: client, project, team member
- Ticket throughput: tickets closed per week/month
- Status duration breakdown: avg time spent in each status (bottleneck detection)
- Line chart: tickets closed per week over last 12 weeks

**Performance Dashboard (for reviews/raises)**
- Per team member: tickets closed, avg resolution time, hours logged
- Comparison across team members (anonymizable for non-admin view)
- Useful for quarterly reviews and raise justification

### Database

No new tables. All reports are computed from existing data:
- `time_entries` → hours per member, per client, per period
- `tickets` → created_at, closed_at, status changes from `ticket_activity`
- `client_packages` → hours_included for profitability calc

### Files to Create

**`app/admin/reports/page.tsx`** — Server component, renders ReportsDashboard

**`components/ReportsDashboard.tsx`**
- Tab layout: Utilization | Profitability | Velocity | Performance
- Date range picker with presets (this week, this month, last month, this quarter, custom)
- Each tab renders its own report component

**`components/TeamUtilizationChart.tsx`**
- Horizontal bar chart per team member
- Stacked by client (colored segments)
- Total hours + utilization % labels

**`components/ClientProfitabilityReport.tsx`**
- Table with sortable columns: client, package, included hours, logged hours, overage
- Monthly trend sparklines
- Color: green (under), yellow (80-99%), red (over)

**`components/TicketVelocityChart.tsx`**
- Line chart: tickets closed over time
- Filter by client/project
- Status duration breakdown bars

**`components/PerformanceReport.tsx`**
- Per-member stats cards
- Comparison view

**API Routes:**
- `app/api/admin/reports/utilization/route.ts` — GET with `?period=week|month&start=&end=`
- `app/api/admin/reports/profitability/route.ts` — GET with `?month=2026-03`
- `app/api/admin/reports/velocity/route.ts` — GET with `?start=&end=&clientId=&projectId=`
- `app/api/admin/reports/performance/route.ts` — GET with `?start=&end=`

**`components/AdminNav.tsx`** (modify) — add "Reports" to nav

### Charts Library

Use lightweight charting — options:
1. **CSS-only bars** for simple horizontal bars (no dependency)
2. **Recharts** (`npm install recharts`) for line/area charts if needed
3. Keep it minimal — charts should communicate, not impress

### Verification
- [ ] Navigate to /admin/reports → see dashboard with tabs
- [ ] Utilization: see each team member's hours this month
- [ ] Profitability: see each client's hours vs. package
- [ ] Velocity: see tickets closed per week trend
- [ ] Performance: see per-member stats
- [ ] Date range picker works, reports refresh
- [ ] Admin-only access (members can see their own stats only)

---

# PHASE 14: Global Search (Cmd+K) + Keyboard Shortcuts

**What:** Command palette for quick navigation + keyboard shortcuts for power users.

**Why:** As ticket count grows, fast search becomes critical. Cmd+K is expected in modern tools. Keyboard shortcuts reduce mouse dependency for the team.

### Database Migration

File: `db/migrations/016_search_index.sql`
```sql
-- Full-text search vector column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE tickets SET search_vector =
  setweight(to_tsvector('english', coalesce(ticket_number, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B');

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_tickets_search ON tickets USING GIN(search_vector);

-- Trigger to keep search_vector updated
CREATE OR REPLACE FUNCTION tickets_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.ticket_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tickets_search_trigger
  BEFORE INSERT OR UPDATE OF ticket_number, title, description ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_search_update();
```

### Command Palette (Cmd+K)

**`components/CommandPalette.tsx`**
- Modal overlay triggered by Cmd+K (Mac) / Ctrl+K (Windows)
- Search input at top with debounced (200ms) query
- Results grouped by type: Tickets, Projects (Phase 10), Clients, Team Members
- Each result: icon + title + subtitle (ticket number, client name, etc.)
- Arrow keys to navigate, Enter to select, Escape to close
- Recent searches stored in localStorage

**Search behavior:**
- Empty query → show recent items + quick actions (New Ticket, Go to Reports)
- Typing → search across all entity types simultaneously
- Ticket search uses PostgreSQL full-text (`search_vector @@ plainto_tsquery()`)
- Client/member search uses ILIKE on name fields
- Results ranked: exact ticket number match first, then title matches, then description matches

### Keyboard Shortcuts

**`components/KeyboardShortcutProvider.tsx`**
- Context provider wrapping the admin layout
- Listens for keyboard events, dispatches actions
- Shortcuts only active when no input/textarea/editor is focused

**Shortcuts:**
| Key | Action | Context |
|-----|--------|---------|
| `Cmd+K` | Open command palette | Global |
| `N` | New ticket | List view |
| `J` | Move selection down | List view |
| `K` | Move selection up | List view |
| `Enter` | Open selected ticket | List view |
| `Escape` | Close modal/palette | Global |
| `/` | Focus search input | List view |
| `?` | Show shortcut help | Global |

**`components/ShortcutHelpModal.tsx`**
- Shows all available shortcuts in a clean grid
- Triggered by `?` key

### API Routes

**`app/api/admin/search/route.ts`**
- GET `?q=homepage+redesign&types=tickets,clients,members`
- Returns unified results: `{ tickets: [...], clients: [...], members: [...] }`
- Tickets: full-text search on search_vector + ILIKE fallback for ticket numbers
- Clients: ILIKE on business_name
- Team Members: ILIKE on name

### Files to Modify

**`app/admin/layout.tsx`** — wrap content in KeyboardShortcutProvider
**`components/AdminNav.tsx`** — add search icon/shortcut hint ("Cmd+K")
**`components/TicketListView.tsx`** — wire J/K/Enter shortcuts for row navigation

### Verification
- [ ] Cmd+K opens command palette
- [ ] Type "CHQ-042" → finds that ticket instantly
- [ ] Type "homepage" → finds tickets with "homepage" in title or description
- [ ] Type client name → shows matching client
- [ ] Arrow keys navigate results, Enter opens selected
- [ ] Escape closes palette
- [ ] `N` key on list view → opens create ticket modal
- [ ] `J`/`K` on list view → highlights next/previous ticket
- [ ] `Enter` on highlighted ticket → opens detail modal
- [ ] `/` focuses the filter search input
- [ ] `?` shows shortcut help modal
- [ ] Shortcuts don't fire when typing in an input field

---

# Summary: Phase Order & Dependencies (Updated)

```
Phase 1:  Team Auth            ← foundation, do first
Phase 2:  Tickets DB + API     ← depends on Phase 1 (created_by_id)
Phase 3:  Activity Log         ← depends on Phase 2
Phase 4:  Ticket List View UI  ← depends on Phase 2
Phase 5:  Detail Modal         ← depends on Phase 3 + 4
Phase 6:  Create Ticket        ← depends on Phase 5
Phase 7:  Time Tracking        ← depends on Phase 6
Phase 8:  Rich Text + Comments ← depends on Phase 5
Phase 9:  Notifications        ← depends on Phase 3 + 7 + 8
Phase 10: Projects + Templates ← depends on Phase 6
Phase 11: Recurring Tickets    ← depends on Phase 6
Phase 12: Home + Client View   ← depends on all above
Phase 13: Reporting & Analytics← depends on Phase 7 (time data) + Phase 12
Phase 14: Global Search + Cmd+K← depends on Phase 2 (tickets), can do after Phase 4
```
