import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();

    if (!q) {
      return NextResponse.json({ tickets: [], clients: [], projects: [], members: [], comments: [], notes: [] });
    }

    const convex = getConvexClient();
    const searchLower = q.toLowerCase();

    // Fetch data in parallel from Convex
    const [allTickets, allClients, allProjects, allMembers] = await Promise.all([
      convex.query(api.tickets.search, { query: q, limit: 8 }),
      convex.query(api.clients.list, {}),
      convex.query(api.projects.list, {}),
      convex.query(api.teamMembers.list, {}),
    ]);

    // Format tickets
    const tickets = (allTickets as any[]).map((t: any) => ({
      id: t._id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      clientName: t.clientName || "",
    }));

    // Filter clients by name
    const clients = (allClients as any[])
      .filter((c: any) => c.name.toLowerCase().includes(searchLower))
      .slice(0, 5)
      .map((c: any) => ({
        id: c._id,
        name: c.name,
        clientStatus: c.clientStatus || "",
      }));

    // Filter projects by name
    const projects = (allProjects as any[])
      .filter((p: any) => !p.archived && !p.isTemplate && p.name.toLowerCase().includes(searchLower))
      .slice(0, 5)
      .map((p: any) => ({
        id: p._id,
        name: p.name,
        clientName: p.clientName || "",
      }));

    // Filter team members by name
    const members = (allMembers as any[])
      .filter((m: any) => m.active && m.name.toLowerCase().includes(searchLower))
      .slice(0, 5)
      .map((m: any) => ({
        id: m._id,
        name: m.name,
        role: m.role,
      }));

    // Comments and notes search not available via simple Convex queries — return empty
    // These could be added later with Convex search indexes
    return NextResponse.json({
      tickets,
      clients,
      projects,
      members,
      comments: [],
      notes: [],
    });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
