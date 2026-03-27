# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InsightPulse is Choquer Agency's internal portal with two surfaces:
- **Client dashboard** (`/[slug]`) — public-facing SEO performance dashboards per client (GA4, GSC, SE Ranking data)
- **Admin portal** (`/admin`) — internal CRM, task management, timesheets, service board, reports, meetings, and team management

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Convex (primary DB + real-time) — **always read `convex/_generated/ai/guidelines.md` before writing Convex code**
- **Styling**: Tailwind CSS v4 (`@import "tailwindcss"` — no tailwind.config, uses CSS-first config)
- **Rich text**: TipTap editor (dynamically imported with `ssr: false`)
- **Charts**: Recharts
- **Auth**: Cookie-based admin auth (base64 JSON, no JWT) — `lib/admin-auth.ts`
- **Integrations**: GA4, GSC, SE Ranking, Notion, Slack, Resend (email), Anthropic Claude, Langfuse
- **Hosting**: Vercel (crons in `vercel.json`, blobs for uploads)

## Commands

```bash
npm run dev      # Dev server on port 3388
npm run build    # Production build (TS errors currently ignored in next.config.ts)
npm run lint     # ESLint (next/core-web-vitals + next/typescript)
npx convex dev   # Convex dev server (syncs schema + functions to cloud)
```

## Architecture

### Two Convex Clients

- **Server-side** (`lib/convex-server.ts`): `ConvexHttpClient` singleton — used in `lib/*.ts` helpers and API routes
- **Client-side** (`components/ConvexClientProvider.tsx`): `ConvexReactClient` — used in `"use client"` components via `useQuery`/`useMutation`

### Data Flow: Admin Portal

```
Component → fetch("/api/admin/...") → API route → lib/*.ts helper → ConvexHttpClient → convex/*.ts
```

API routes handle auth + permission checks. Library files in `lib/` own the business logic and Convex calls. Components call API routes via `fetch`, not Convex directly (except for real-time subscriptions).

### Data Flow: Client Dashboard

```
Server component (app/[slug]/page.tsx) → lib/gsc.ts, lib/ga4.ts, lib/serankings.ts → props to client components
```

External analytics data is fetched server-side and passed down. Convex data (approvals, enriched content) is also fetched server-side via `lib/db.ts`.

### RBAC

5-tier roles in `lib/permissions.ts`: owner (50) > c_suite (40) > bookkeeper (30) > employee (20) > intern (10). Check access with `hasPermission(roleLevel, "permission:name")`. Session lives in `insightpulse_admin` cookie. Admin layout (`app/admin/layout.tsx`) gates all admin pages — shows login if no session.

### Path Alias

`@/*` maps to project root — use `@/lib/...`, `@/components/...`, `@/convex/...`.

## Changelog (What's New)

After completing any user-facing feature, UI change, or structural change (moving pages, renaming sections, adding new functionality, etc.), **always** create a changelog entry by calling `POST /api/admin/changelog` with:
- `title`: Short name (e.g. "Timesheet moved to Settings")
- `description`: Detailed, employee-focused explanation. Over-communicate — explain what they can do, not the technical details. Use markdown links like `[Settings > Notifications](/admin/settings/notifications)` for clickable navigation. Use bullet points (lines starting with `- `) to list multiple examples or capabilities. Give examples of how to use new features.
- `category`: One of `"feature"`, `"improvement"`, `"fix"`, `"design"`, `"moved"`
- `imageUrl` (optional): Screenshot or image of the actual UI element you built (a new button, a new page section, a new icon). Shown below the title so employees can see exactly what to look for. Do NOT use generic emojis — only real screenshots of the UI change.
- `visibility`: `"team"` (default — shown to everyone) or `"internal"` (only owner/c_suite see it). Use `"internal"` for backend fixes, infrastructure changes, and technical updates that don't affect the employee experience.

**Writing good descriptions:**
- Write from the employee's perspective — what can they do now? Not what was broken technically.
- Include examples: "Try telling the Slack bot 'I'm stuck on CHQ-142' and it will flag the ticket for you"
- Include clickable links to the relevant page when applicable
- One-liners are fine when the change is self-explanatory
- Never use technical jargon (Convex, API, migration, etc.) — translate to user impact

This is non-negotiable — the team relies on this feed to stay current. A PostToolUse hook also auto-creates entries from git commits, but manual entries from Claude are higher quality since they can include context the commit message lacks.

## Conventions

### Convex Functions (`convex/*.ts`)

- Named exports only: `export const list = query({ args: {...}, handler: async (ctx, args) => {...} })`
- Args use `v` validators inline: `v.id("clients")`, `v.optional(v.string())`, `v.union(...)`
- Queries use `.withIndex()` for indexed lookups, then JS filtering for complex conditions
- Mutations return the inserted doc ID: `return ctx.db.insert("table", data)`
- camelCase for function names (`getById`, `listByClient`) and table names

### API Routes (`app/api/admin/...`)

Every admin route follows this pattern:
1. `const session = getSession(request)` — return 401 if null
2. Permission check with `hasPermission()` if needed
3. Call `lib/*.ts` helper function (not Convex directly)
4. Return `NextResponse.json(data)` (200 for GET/PUT, 201 for POST)
5. Errors: `{ error: "message" }` with status 400/401/403/404/500, wrapped in try/catch

### Components

- All interactive components use `"use client"`
- Modals accept `onClose` + `onSaved`/`onCreated` callbacks, manage own `submitting` state
- Forms use individual `useState` per field (not form libraries)
- TipTap editor: always import with `dynamic(() => import("./TiptapEditor"), { ssr: false })`
- **Always use `components/DatePicker.tsx`** for any date selection — it's portal-based and supports `displayFormat`, `clearable`, custom `placeholder`
- Nav permission gating: `NAV_LINKS` array in AdminNav, filtered by `hasPermission`

### UI Rules

- No gradient hero/greeting sections — keep them clean and minimal
- Client statuses: `"new"` | `"active"` | `"offboarding"` | `"inactive"`
- Ticket statuses: `"needs_attention"` | `"in_progress"` | `"complete"`
- Ticket numbers: `CHQ-XXX` format (sequential via Convex `counters` table)
- Admin portal renders at `font-size: 80%` (set on admin layout wrapper)

## Key Directories

- `convex/` — Schema + all backend queries/mutations. `schema.ts` is the source of truth for all tables.
- `lib/` — Server-side business logic. One file per domain (`tickets.ts`, `clients.ts`, `team-members.ts`, etc.)
- `lib/slack-assistant/` — Slack bot: intent classification, conversation handlers, voice corrections
- `components/` — React components. Subdirs: `client-portal/`, `gantt/`, `reports/`, `timesheet/`
- `hooks/` — Custom hooks: `useTickets`, `useSubTickets`, `useGanttData`
- `app/api/` — API routes. Admin routes under `api/admin/`, external integrations at top level
- `scripts/` — One-off migration scripts (ClickUp, Supabase → Convex)
- `types/` — Shared TypeScript type definitions (`types/index.ts`)

## Cron Jobs

Defined in `vercel.json`, secured with `CRON_SECRET`:
- Monthly: analytics snapshots (1st of month)
- Daily: content enrichment, notifications, recurring ticket creation
- Weekdays: EOD Slack check-ins (9:30 PM UTC)
- Weekly: summaries (Sunday), quote rotation (Friday)
