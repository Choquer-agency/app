import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TrackingEvent, Approval } from "@/types";
import crypto from "crypto";

// ─── Activity Tracking ────────────────────────────────────────────────────────

export async function logActivities(events: TrackingEvent[]): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.activityLog.logBatch, {
    events: events.map((e) => ({
      clientSlug: e.clientSlug,
      eventType: e.eventType,
      eventDetail: e.eventDetail,
      sessionId: e.sessionId,
      deviceType: e.deviceType,
      referrer: e.referrer,
      visitorId: e.visitorId as any,
    })),
  });
}

export async function getActivityForClient(slug: string, days = 30, limit = 200) {
  const convex = getConvexClient();
  const docs = await convex.query(api.activityLog.listByClient, { clientSlug: slug, limit });
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return docs
    .filter((d: any) => d._creationTime > cutoff)
    .map((d: any) => ({
      id: d._id,
      client_slug: d.clientSlug,
      event_type: d.eventType,
      event_detail: d.eventDetail,
      session_id: d.sessionId,
      device_type: d.deviceType,
      referrer: d.referrer,
      visitor_id: d.visitorId,
      timestamp: new Date(d._creationTime).toISOString(),
    }));
}

export async function getEngagementSummary() {
  const convex = getConvexClient();
  return await convex.query(api.activityLog.getEngagementSummary, {});
}

export async function getSectionHeatmap() {
  const convex = getConvexClient();
  const docs = await convex.query(api.activityLog.listByClient, { clientSlug: "", limit: 5000 });
  // Aggregate section views in JS
  const counts: Record<string, number> = {};
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const d of docs as any[]) {
    if (d.eventType === "section_view" && d._creationTime > cutoff && d.eventDetail?.section) {
      const section = d.eventDetail.section;
      counts[section] = (counts[section] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([section, view_count]) => ({ section, view_count }))
    .sort((a, b) => b.view_count - a.view_count);
}

export async function getChurnRiskClients(daysSinceVisit = 30) {
  const summary = await getEngagementSummary();
  const cutoff = new Date(Date.now() - daysSinceVisit * 24 * 60 * 60 * 1000).toISOString();
  return (summary as any[])
    .filter((s) => s.last_visit < cutoff)
    .map((s) => ({ client_slug: s.client_slug, last_visit: s.last_visit }));
}

// ─── Enriched Content ─────────────────────────────────────────────────────────

export async function getEnrichedContent(clientSlug: string) {
  const convex = getConvexClient();
  const doc = await convex.query(api.enrichedContent.getLatest, { clientSlug });
  if (!doc) return null;
  return {
    enrichedData: doc.enrichedData,
    rawContent: doc.rawContent,
    processedAt: new Date(doc._creationTime).toISOString(),
  };
}

export async function getEnrichedContentForMonth(clientSlug: string, month: string) {
  const convex = getConvexClient();
  const doc = await convex.query(api.enrichedContent.getForMonth, { clientSlug, month });
  if (!doc) return null;
  return doc.enrichedData;
}

export async function getExistingContentHash(clientSlug: string, month: string): Promise<string | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.enrichedContent.getForMonth, { clientSlug, month });
  if (!doc || !doc.enrichedData) return null;
  return (doc.enrichedData as any)?.rawContentHash ?? null;
}

export async function getExistingEnrichedData(clientSlug: string, month: string) {
  const convex = getConvexClient();
  const doc = await convex.query(api.enrichedContent.getForMonth, { clientSlug, month });
  if (!doc) return null;
  return { enrichedData: doc.enrichedData, rawContent: doc.rawContent };
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export async function getApprovals(clientSlug: string): Promise<Approval[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.approvals.listByClient, { clientSlug });
  return (docs as any[]).map((d) => ({
    id: d._id,
    clientSlug: d.clientSlug,
    title: d.title,
    description: d.description ?? null,
    links: d.links ?? [],
    status: d.status,
    feedback: d.feedback ?? null,
    createdAt: new Date(d._creationTime).toISOString(),
    updatedAt: new Date(d._creationTime).toISOString(),
  }));
}

export async function updateApprovalStatus(
  id: string,
  status: "approved" | "rejected",
  feedback?: string
): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.approvals.updateStatus, { id: id as any, status, feedback });
}

function computeApprovalHash(description: string, links?: Array<{ url: string; label: string }>): string {
  const normalizedDesc = (description || "").toLowerCase().trim().replace(/\s+/g, " ");
  const normalizedLinks = (links || []).map((l) => l.url.toLowerCase().trim()).sort().join("|");
  return crypto.createHash("md5").update(`${normalizedDesc}::${normalizedLinks}`).digest("hex");
}

export async function upsertApproval(
  clientSlug: string,
  title: string,
  description: string,
  links?: Array<{ url: string; label: string }>
): Promise<void> {
  const convex = getConvexClient();
  const contentHash = computeApprovalHash(description, links);
  await convex.mutation(api.approvals.upsert, {
    clientSlug,
    title,
    description,
    links,
    contentHash,
  });
}

export async function getActedApprovals() {
  const convex = getConvexClient();
  const allClients = await convex.query(api.clients.list, { includeInactive: true });
  const clientMap = new Map((allClients as any[]).map((c) => [c.slug, c.name]));

  // Get all approvals across all clients
  const results: any[] = [];
  for (const client of allClients as any[]) {
    const approvals = await convex.query(api.approvals.listByClient, { clientSlug: client.slug });
    for (const a of approvals as any[]) {
      if (a.status === "approved" || a.status === "rejected") {
        results.push({
          id: a._id,
          client_slug: a.clientSlug,
          title: a.title,
          description: a.description,
          status: a.status,
          feedback: a.feedback,
          updated_at: new Date(a._creationTime).toISOString(),
          client_name: clientMap.get(a.clientSlug) ?? a.clientSlug,
        });
      }
    }
  }
  return results.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function dismissApproval(id: string): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.approvals.dismiss, { id: id as any });
}

export async function autoApproveStalePending(): Promise<number> {
  // This would need a Convex mutation; for now return 0
  return 0;
}

export async function backfillApprovalHashes(): Promise<number> {
  return 0;
}

// ─── Visitor Identification ───────────────────────────────────────────────────

export async function lookupVisitorByDevice(clientSlug: string, deviceId: string) {
  const convex = getConvexClient();
  return await convex.query(api.visitors.lookupByDevice, { clientSlug, deviceId });
}

export async function registerVisitor(
  clientSlug: string,
  visitorName: string,
  deviceId: string,
  deviceType: string,
  userAgent: string
) {
  const convex = getConvexClient();
  return await convex.mutation(api.visitors.register, {
    clientSlug,
    visitorName,
    deviceId,
    deviceType,
    userAgent,
  });
}

export async function getVisitorEngagement(days = 30) {
  // Complex aggregation - return empty for now, can be implemented with Convex action
  return [];
}

export async function getVisitorDetail(visitorId: string, days = 90) {
  // Complex aggregation - return null for now
  return null;
}

export async function getVisitorChurnRisk(daysSinceVisit = 30) {
  return [];
}
