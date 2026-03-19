import { sql } from "@vercel/postgres";
import { TrackingEvent } from "@/types";
import crypto from "crypto";

/**
 * Log a batch of activity events
 */
export async function logActivities(events: TrackingEvent[]): Promise<void> {
  for (const event of events) {
    await sql`
      INSERT INTO activity_log (client_slug, event_type, event_detail, session_id, device_type, referrer, visitor_id)
      VALUES (
        ${event.clientSlug},
        ${event.eventType},
        ${JSON.stringify(event.eventDetail || {})},
        ${event.sessionId},
        ${event.deviceType},
        ${event.referrer || null},
        ${event.visitorId || null}
      )
    `;
  }
}

/**
 * Get activity events for a client within a date range
 */
export async function getActivityForClient(
  slug: string,
  days = 30,
  limit = 200
) {
  const result = await sql`
    SELECT * FROM activity_log
    WHERE client_slug = ${slug}
      AND timestamp > NOW() - INTERVAL '1 day' * ${days}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
  return result.rows;
}

/**
 * Get engagement summary for all clients
 */
export async function getEngagementSummary() {
  const result = await sql`
    SELECT
      client_slug,
      MAX(timestamp) as last_visit,
      COUNT(*) FILTER (WHERE event_type = 'page_view' AND timestamp > NOW() - INTERVAL '7 days') as visits_7d,
      COUNT(*) FILTER (WHERE event_type = 'page_view' AND timestamp > NOW() - INTERVAL '30 days') as visits_30d,
      COUNT(*) FILTER (WHERE event_type = 'cta_click') as cta_clicks,
      COUNT(DISTINCT session_id) FILTER (WHERE timestamp > NOW() - INTERVAL '30 days') as sessions_30d
    FROM activity_log
    GROUP BY client_slug
    ORDER BY last_visit DESC
  `;
  return result.rows;
}

/**
 * Get section view heatmap across all clients
 */
export async function getSectionHeatmap() {
  const result = await sql`
    SELECT
      event_detail->>'section' as section,
      COUNT(*) as view_count
    FROM activity_log
    WHERE event_type = 'section_view'
      AND timestamp > NOW() - INTERVAL '30 days'
    GROUP BY event_detail->>'section'
    ORDER BY view_count DESC
  `;
  return result.rows;
}

/**
 * Get clients who haven't visited in N days
 */
export async function getChurnRiskClients(daysSinceVisit = 30) {
  const result = await sql`
    SELECT
      client_slug,
      MAX(timestamp) as last_visit
    FROM activity_log
    WHERE event_type = 'page_view'
    GROUP BY client_slug
    HAVING MAX(timestamp) < NOW() - INTERVAL '1 day' * ${daysSinceVisit}
    ORDER BY last_visit ASC
  `;
  return result.rows;
}

// ─── Enriched Content ───────────────────────────────────────────────────────

/**
 * Get the latest enriched content for a client
 */
export async function getEnrichedContent(clientSlug: string) {
  const result = await sql`
    SELECT enriched_data, raw_content, processed_at
    FROM enriched_content
    WHERE client_slug = ${clientSlug}
    ORDER BY month DESC
    LIMIT 1
  `;
  if (result.rows.length === 0) return null;
  return {
    enrichedData: result.rows[0].enriched_data,
    rawContent: result.rows[0].raw_content,
    processedAt: result.rows[0].processed_at,
  };
}

/**
 * Get enriched content for a specific month
 */
export async function getEnrichedContentForMonth(clientSlug: string, month: string) {
  const result = await sql`
    SELECT enriched_data, processed_at
    FROM enriched_content
    WHERE client_slug = ${clientSlug} AND month = ${month}
  `;
  if (result.rows.length === 0) return null;
  return result.rows[0].enriched_data;
}

/**
 * Get the stored content hash for a client+month (for differential sync)
 */
export async function getExistingContentHash(
  clientSlug: string,
  month: string
): Promise<string | null> {
  const result = await sql`
    SELECT enriched_data->>'rawContentHash' as hash
    FROM enriched_content
    WHERE client_slug = ${clientSlug} AND month = ${month}
  `;
  if (result.rows.length === 0) return null;
  return result.rows[0].hash;
}

/**
 * Get existing enriched data for merging (current-month-only mode)
 */
export async function getExistingEnrichedData(
  clientSlug: string,
  month: string
) {
  const result = await sql`
    SELECT enriched_data, raw_content
    FROM enriched_content
    WHERE client_slug = ${clientSlug} AND month = ${month}
  `;
  if (result.rows.length === 0) return null;
  return {
    enrichedData: result.rows[0].enriched_data,
    rawContent: result.rows[0].raw_content,
  };
}

// ─── Approvals ──────────────────────────────────────────────────────────────

import { Approval } from "@/types";

/**
 * Get all approvals for a client (pending first)
 */
export async function getApprovals(clientSlug: string): Promise<Approval[]> {
  const result = await sql`
    SELECT id, client_slug, title, description, links, status, feedback, created_at, updated_at
    FROM approvals
    WHERE client_slug = ${clientSlug}
      AND status != 'dismissed'
    ORDER BY
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
      created_at DESC
  `;
  return result.rows.map((r) => ({
    id: r.id as number,
    clientSlug: r.client_slug as string,
    title: r.title as string,
    description: r.description as string | null,
    links: (r.links || []) as Approval["links"],
    status: r.status as Approval["status"],
    feedback: r.feedback as string | null,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  }));
}

/**
 * Update approval status
 */
export async function updateApprovalStatus(
  id: number,
  status: "approved" | "rejected",
  feedback?: string
): Promise<void> {
  await sql`
    UPDATE approvals
    SET status = ${status}, feedback = ${feedback || null}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

/**
 * Compute a content hash for an approval based on description + link URLs.
 * Title is excluded because Claude may generate slightly different titles
 * for the same underlying approval request on re-crawls.
 */
function computeApprovalHash(
  description: string,
  links?: Array<{ url: string; label: string }>
): string {
  const normalizedDesc = (description || "").toLowerCase().trim().replace(/\s+/g, " ");
  const normalizedLinks = (links || [])
    .map((l) => l.url.toLowerCase().trim())
    .sort()
    .join("|");
  return crypto
    .createHash("md5")
    .update(`${normalizedDesc}::${normalizedLinks}`)
    .digest("hex");
}

/**
 * Upsert an approval (skip if already exists to preserve status).
 * Uses content_hash to detect duplicates even when Claude generates different titles.
 * If a non-pending approval with the same content already exists, skip entirely.
 */
export async function upsertApproval(
  clientSlug: string,
  title: string,
  description: string,
  links?: Array<{ url: string; label: string }>
): Promise<void> {
  const linksJson = JSON.stringify(links || []);
  const contentHash = computeApprovalHash(description, links);

  // Check if this approval was already acted on (by content, not title)
  const existing = await sql`
    SELECT id FROM approvals
    WHERE client_slug = ${clientSlug}
      AND content_hash = ${contentHash}
      AND status != 'pending'
    LIMIT 1
  `;
  if (existing.rows.length > 0) return;

  await sql`
    INSERT INTO approvals (client_slug, title, description, links, content_hash)
    VALUES (${clientSlug}, ${title}, ${description}, ${linksJson}::jsonb, ${contentHash})
    ON CONFLICT (client_slug, title) DO UPDATE
      SET description = EXCLUDED.description,
          links = EXCLUDED.links,
          content_hash = EXCLUDED.content_hash
      WHERE approvals.status = 'pending'
  `;
}

/**
 * Get all acted-on approvals for admin notifications (approved + rejected with feedback)
 */
export async function getActedApprovals() {
  const result = await sql`
    SELECT a.id, a.client_slug, a.title, a.description, a.status, a.feedback, a.updated_at, c.name as client_name
    FROM approvals a
    LEFT JOIN clients c ON c.slug = a.client_slug
    WHERE a.status IN ('approved', 'rejected')
    ORDER BY a.updated_at DESC
  `;
  return result.rows;
}

/**
 * Dismiss an approval notification (marks as dismissed instead of deleting,
 * so re-crawls don't resurrect it)
 */
export async function dismissApproval(id: number): Promise<void> {
  await sql`UPDATE approvals SET status = 'dismissed', updated_at = NOW() WHERE id = ${id}`;
}

/**
 * Auto-approve pending approvals older than 7 days.
 * Returns the number of approvals that were auto-approved.
 */
export async function autoApproveStalePending(): Promise<number> {
  const result = await sql`
    UPDATE approvals
    SET status = 'approved',
        feedback = 'Auto-approved after 7 days',
        updated_at = NOW()
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  `;
  return result.rows.length;
}

/**
 * Backfill content_hash for existing approval rows that don't have one.
 * Call once to populate hashes for pre-existing approvals.
 */
export async function backfillApprovalHashes(): Promise<number> {
  const rows = await sql`
    SELECT id, description, links FROM approvals WHERE content_hash IS NULL
  `;
  let updated = 0;
  for (const row of rows.rows) {
    const hash = computeApprovalHash(
      row.description || "",
      (row.links || []) as Array<{ url: string; label: string }>
    );
    await sql`UPDATE approvals SET content_hash = ${hash} WHERE id = ${row.id}`;
    updated++;
  }
  return updated;
}

// ─── Visitor Identification ──────────────────────────────────────────────────

/**
 * Look up a visitor by their device_id for a given client
 */
export async function lookupVisitorByDevice(clientSlug: string, deviceId: string) {
  const result = await sql`
    SELECT v.id, v.visitor_name
    FROM visitor_devices vd
    JOIN visitors v ON v.id = vd.visitor_id
    WHERE vd.device_id = ${deviceId}
      AND v.client_slug = ${clientSlug}
  `;

  if (result.rows.length > 0) {
    await sql`UPDATE visitor_devices SET last_seen = NOW() WHERE device_id = ${deviceId}`;
    return { id: result.rows[0].id, visitorName: result.rows[0].visitor_name };
  }

  return null;
}

/**
 * Register a visitor (upsert by name) and link their device
 */
export async function registerVisitor(
  clientSlug: string,
  visitorName: string,
  deviceId: string,
  deviceType: string,
  userAgent: string
) {
  // Try to insert the visitor; if name already exists for this client, fetch existing
  let visitorId: number;

  const insertResult = await sql`
    INSERT INTO visitors (client_slug, visitor_name)
    VALUES (${clientSlug}, ${visitorName.trim()})
    ON CONFLICT (client_slug, LOWER(visitor_name)) DO NOTHING
    RETURNING id
  `;

  if (insertResult.rows.length > 0) {
    visitorId = insertResult.rows[0].id;
  } else {
    const existing = await sql`
      SELECT id FROM visitors
      WHERE client_slug = ${clientSlug}
        AND LOWER(visitor_name) = LOWER(${visitorName.trim()})
    `;
    visitorId = existing.rows[0].id;
  }

  // Link device to visitor (upsert in case device already exists)
  await sql`
    INSERT INTO visitor_devices (visitor_id, device_id, device_type, user_agent)
    VALUES (${visitorId}, ${deviceId}, ${deviceType}, ${userAgent})
    ON CONFLICT (device_id) DO UPDATE SET
      visitor_id = ${visitorId},
      last_seen = NOW()
  `;

  return { id: visitorId, visitorName: visitorName.trim() };
}

/**
 * Get per-visitor engagement stats for the admin dashboard
 */
export async function getVisitorEngagement(days = 30) {
  const result = await sql`
    SELECT
      v.id as visitor_id,
      v.visitor_name,
      v.client_slug,
      MAX(al.timestamp) as last_visit,
      COUNT(*) FILTER (WHERE al.event_type = 'page_view' AND al.timestamp > NOW() - INTERVAL '7 days') as visits_7d,
      COUNT(*) FILTER (WHERE al.event_type = 'page_view' AND al.timestamp > NOW() - INTERVAL '1 day' * ${days}) as visits_30d,
      COUNT(DISTINCT al.session_id) FILTER (WHERE al.timestamp > NOW() - INTERVAL '1 day' * ${days}) as sessions_30d,
      COUNT(*) FILTER (WHERE al.event_type = 'cta_click') as cta_clicks,
      SUM(CASE WHEN al.event_type = 'time_on_page' THEN COALESCE((al.event_detail->>'seconds')::int, 0) ELSE 0 END)
        FILTER (WHERE al.timestamp > NOW() - INTERVAL '1 day' * ${days}) as total_time_seconds
    FROM activity_log al
    JOIN visitors v ON v.id = al.visitor_id
    WHERE al.visitor_id IS NOT NULL
    GROUP BY v.id, v.visitor_name, v.client_slug
    ORDER BY last_visit DESC
  `;
  return result.rows;
}

/**
 * Get session-by-session detail for a specific visitor
 */
export async function getVisitorDetail(visitorId: number, days = 90) {
  // Visitor info
  const visitorResult = await sql`
    SELECT v.*, array_agg(DISTINCT vd.device_type) as device_types
    FROM visitors v
    LEFT JOIN visitor_devices vd ON vd.visitor_id = v.id
    WHERE v.id = ${visitorId}
    GROUP BY v.id
  `;

  if (visitorResult.rows.length === 0) return null;

  // Session summaries
  const sessionsResult = await sql`
    SELECT
      session_id,
      MIN(timestamp) as session_start,
      MAX(timestamp) as session_end,
      COUNT(*) FILTER (WHERE event_type = 'time_on_page') * 30 as duration_seconds,
      array_agg(DISTINCT event_detail->>'section') FILTER (WHERE event_type = 'section_view') as sections_viewed,
      bool_or(event_type = 'cta_click') as clicked_cta,
      array_agg(DISTINCT event_detail->>'range') FILTER (WHERE event_type = 'timerange_toggle') as timeranges_used,
      array_agg(DISTINCT event_detail->>'month') FILTER (WHERE event_type = 'accordion_open') as months_opened
    FROM activity_log
    WHERE visitor_id = ${visitorId}
      AND timestamp > NOW() - INTERVAL '1 day' * ${days}
    GROUP BY session_id
    ORDER BY session_start DESC
  `;

  return {
    visitor: visitorResult.rows[0],
    sessions: sessionsResult.rows,
  };
}

/**
 * Get churn risk visitors (no visit in N days)
 */
export async function getVisitorChurnRisk(daysSinceVisit = 30) {
  const result = await sql`
    SELECT
      v.id as visitor_id,
      v.visitor_name,
      v.client_slug,
      MAX(al.timestamp) as last_visit
    FROM activity_log al
    JOIN visitors v ON v.id = al.visitor_id
    WHERE al.event_type = 'page_view'
      AND al.visitor_id IS NOT NULL
    GROUP BY v.id, v.visitor_name, v.client_slug
    HAVING MAX(al.timestamp) < NOW() - INTERVAL '1 day' * ${daysSinceVisit}
    ORDER BY last_visit ASC
  `;
  return result.rows;
}
