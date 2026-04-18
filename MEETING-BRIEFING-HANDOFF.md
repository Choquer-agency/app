# Meeting Tab — AI Briefing System Handoff

## What We're Building

The Meetings tab in Reports (`/admin/reports` → Meetings) is being transformed into an AI-powered Monday Morning Briefing tool for 1:1 meetings with team members.

### The Vision
When Bryce opens a team member's meeting view:
1. He sees their performance metrics (reliability, utilization, velocity, tickets)
2. Clicks "Generate Briefing" — an AI agent analyzes ALL of that member's data and generates specific, data-driven discussion points (not generic questions)
3. After the meeting, he pastes the transcript — the system extracts action items (new tickets, updates to existing tickets) for review and approval
4. Past transcripts feed into future briefings for continuity

### Each team member has different meeting styles:
- **Andres** (SEO): accountability-focused, weekly Monday meetings. Tends to over-promise/under-deliver.
- **Lauren** (Designer): coaching-focused, meets Monday/Wednesday/Friday. Junior developer.
- **Johnny** (Web Dev): minimal oversight, rarely meets.

---

## What Was Built (Working)

### 1. MeetingView Component (`components/MeetingView.tsx`)
- Period selector dropdown (This Week, Last Week, This Month, Last Month, This Year) — defaults to "Last Week"
- Member selector dropdown (filters out bookkeepers/owners)
- **Two rows of metric cards:**
  - Row 1: Reliability Score, On Time, Missed, Due This Week
  - Row 2: Logged/Clocked (utilization %), Tickets Closed, Avg Resolution, Velocity (tickets/week)
- **Four ticket tables** with headings outside: Overdue, Backlog, In Progress, Due This Week
- Clicking a ticket opens `TicketDetailModal` inline (no page navigation)
- All metrics are scoped to the selected period

### 2. AI Briefing Generator
- **Backend data pipeline:** `lib/meeting-briefing.ts`
  - `collectBriefingData(memberId, period)` — gathers ALL member data: tickets, timesheet, activity logs, comments, client distribution, past transcripts, past briefings, question templates
  - `generateBriefing(memberId, period)` — calls Claude Opus 4.6 with up to 50K input tokens
  - Returns structured JSON: questions (with category, data context, follow-up), observations (with severity), member summary
  - Langfuse tracing for observability
- **API route:** `app/api/admin/meetings/briefing/route.ts` (POST)
  - 60s timeout for Opus generation
  - Saves result to `meetingBriefings` Convex table
- **UI:** Orange "Generate Briefing" button under the Monday Meeting heading
  - Briefing appears between metric cards and ticket tables
  - Cards with colored left borders by category (red_flag, accountability, coaching, recognition, planning)
  - Token usage displayed after generation
  - Collapsible

### 3. Convex Schema (deployed to production)
- `meetingQuestionTemplates` — per-member question bank (weekly/monthly)
- `meetingBriefings` — cached generated briefings
- CRUD functions in `convex/meetingQuestionTemplates.ts` and `convex/meetingBriefings.ts`

### 4. Meeting Notes Integration
- Embedded `MeetingNotesIngestion` component at the bottom of MeetingView
- Pre-selects the team member, auto-sets "Team Meeting" type, today's date
- Title field auto-fills "Weekly Huddle - Apr 16"
- Has the full extraction pipeline: paste transcript → Extract Action Items → review → create tickets

---

## What's NOT Working

### Extract Action Items Button — NOT CLICKABLE
The `MeetingNotesIngestion` component's "Extract Action Items" button does not fire when embedded inside `MeetingView`. The root cause is likely one or more of:

1. **Hydration error**: Console shows `<button> cannot be a descendant of <button>`. The team member selector renders removable pill badges (with `<button>` X icons) inside the main dropdown `<button>`. We tried hiding the selector in embedded mode but the fix may not have taken effect. The standalone `/admin/meeting-notes` page likely has the same issue but it works there because the button nesting doesn't happen (no pre-selected pills).

2. **Read-only dev mode**: `lib/convex-server.ts` had `IS_DEV_READ_ONLY` blocking ALL Convex mutations when localhost reads from production Convex (`healthy-bee-950`). We set it to `false` but this change may not have been picked up by the dev server. The meeting notes save endpoint (`POST /api/admin/meeting-notes`) calls `convex.mutation(api.meetingNotes.create, ...)` which would throw silently if blocked.

3. **Dev server caching**: Multiple times during this session, code changes weren't reflected until the `.next` cache was deleted and the dev server restarted. The current state of the dev server may be stale.

### Recommended Debug Steps:
1. Kill dev server, delete `.next`, restart: `rm -rf .next && npm run dev`
2. Verify `IS_DEV_READ_ONLY` is `false` in `lib/convex-server.ts`
3. Verify the member selector is hidden in embedded mode (check `!isEmbedded` guard on the team member selector `<div>` in `MeetingNotesIngestion.tsx`)
4. Test the Extract button on the STANDALONE meeting notes page (`/admin/meeting-notes`) — if it works there, the issue is embedding-specific
5. Check browser console for the hydration `<button>` nesting error
6. If mutations are blocked, test with: `curl -s -X POST http://localhost:3388/api/admin/meeting-notes -H "Content-Type: application/json" -d '{"teamMemberIds":["n177kthe56n5ex7zjxaqab81hn83hj1y"],"transcript":"test","meetingDate":"2026-04-16","interactionType":"team_meeting"}' --cookie "insightpulse_admin=..."` 

### Key Files to Check:
- `components/MeetingNotesIngestion.tsx` — the `handleExtract` function (line ~230), the button `disabled` prop (line ~610), the `isEmbedded` guards, and the `presetMemberId` prop handling
- `lib/convex-server.ts` — `IS_DEV_READ_ONLY` flag (should be `false`)
- `components/MeetingView.tsx` — where `MeetingNotesIngestion` is embedded (~line 539)

---

## Dev Login

The login was updated to skip passwords on localhost:
- `app/api/admin/login/route.ts` — skips bcrypt verification when `NODE_ENV !== "production"`
- `app/admin/login.tsx` — `handleSelect` auto-submits with dummy password when `hostname === "localhost"`
- Any password works on localhost, or clicking a member should auto-login

---

## File Map

| File | Purpose |
|------|---------|
| `components/MeetingView.tsx` | Main Monday Meeting view — metrics, tickets, briefing, notes |
| `components/MeetingNotesIngestion.tsx` | Transcript paste + AI extraction + ticket creation |
| `lib/meeting-briefing.ts` | AI briefing data pipeline + Claude Opus call |
| `lib/commitments.ts` | `getMemberMeetingData()` — computes reliability, work metrics, ticket lists |
| `app/api/admin/meetings/route.ts` | GET member meeting data |
| `app/api/admin/meetings/briefing/route.ts` | POST generate AI briefing |
| `app/api/admin/meeting-notes/route.ts` | POST save transcript, GET list notes |
| `app/api/admin/meeting-notes/extract/route.ts` | POST extract action items via Claude |
| `app/api/admin/meeting-notes/create-tickets/route.ts` | POST create tickets from extraction |
| `lib/meeting-extraction.ts` | Claude extraction logic (existing, working) |
| `convex/meetingBriefings.ts` | Convex CRUD for briefings |
| `convex/meetingQuestionTemplates.ts` | Convex CRUD for question templates |
| `convex/meetingNotes.ts` | Convex CRUD for meeting notes/transcripts |
| `lib/convex-server.ts` | ConvexHttpClient — check IS_DEV_READ_ONLY |
| `app/api/admin/login/route.ts` | Login API — dev mode skips password |
| `app/admin/login.tsx` | Login UI — dev mode auto-submits |

---

## Plan File

The full implementation plan is at: `~/.claude/plans/curried-plotting-goblet.md`

Key remaining phases:
- **Phase 5**: Transcript save widget (partially done — embedded but not working)
- **Phase 6**: Question template management UI (not started)
- Future: Recording integration, past transcript analysis, AI-generated ticket updates from transcripts
