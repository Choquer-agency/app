import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTeamMembers } from "@/lib/team-members";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();

    // Compute current week start (Monday-based) for quote lookup
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // Fetch all data in parallel — use allSettled so one failure doesn't kill everything
    const results = await Promise.allSettled([
      convex.query(api.bulletin.getPersonalNote, { teamMemberId: session.teamMemberId as any }),
      convex.query(api.bulletin.listAnnouncements, { limit: 20 }),
      convex.query(api.projects.list, {}),
      convex.query(api.bulletin.getQuoteForWeek, { weekStart: weekStartStr }),
      convex.query(api.bulletin.listCalendarEvents, {}),
      getTeamMembers(),
      convex.query(api.changelog.list, {
        limit: 10,
        visibility: (session.roleLevel === "owner" || session.roleLevel === "c_suite") ? undefined : "team",
      }),
    ]);

    const personalNoteDoc = results[0].status === "fulfilled" ? results[0].value : null;
    const announcements = results[1].status === "fulfilled" ? (results[1].value as any[]) : [];
    const projects = results[2].status === "fulfilled" ? (results[2].value as any[]) : [];
    const quoteDoc = results[3].status === "fulfilled" ? results[3].value : null;
    const calendarEvents = results[4].status === "fulfilled" ? (results[4].value as any[]) : [];
    const teamMembers = results[5].status === "fulfilled" ? (results[5].value as any[]) : [];
    const changelogRaw = results[6].status === "fulfilled" ? (results[6].value as any[]) : [];

    const changelog = changelogRaw.map((e: any) => ({
      id: e._id,
      title: e.title,
      description: e.description,
      category: e.category,
      icon: e.icon || undefined,
      imageUrl: e.imageUrl || undefined,
      authorName: e.authorName || "Bryce",
      visibility: e.visibility || "team",
      createdAt: e._creationTime
        ? new Date(e._creationTime).toISOString()
        : new Date().toISOString(),
    }));

    const personalNote = personalNoteDoc?.content || "";

    const weeklyQuote = quoteDoc
      ? { quote: quoteDoc.quote as string, author: (quoteDoc.author as string) || "" }
      : null;

    // Fetch team members for author info
    const memberMap = new Map<string, { name: string; profilePicUrl: string }>();
    for (const m of teamMembers) {
      memberMap.set(m.id, { name: m.name, profilePicUrl: m.profilePicUrl || "" });
    }

    // Filter announcements (not expired) and fetch reactions
    const filteredAnnouncements = announcements.filter((a: any) => {
      if (!a.expiresAt) return true;
      return new Date(a.expiresAt) > new Date();
    });

    // Fetch reactions for all announcements in parallel
    const announcementData = await Promise.all(
      filteredAnnouncements.map(async (a: any) => {
        const reactions = await convex.query(api.bulletin.listReactions, { announcementId: a._id as any });
        const reactionData = await Promise.all(
          reactions.map(async (r: any) => {
            const member = memberMap.get(r.teamMemberId);
            return {
              emoji: r.emoji,
              memberName: member?.name || "Unknown",
              memberId: r.teamMemberId,
            };
          })
        );

        const author = memberMap.get(a.authorId);
        return {
          id: a._id,
          authorId: a.authorId,
          authorName: author?.name || "Unknown",
          authorPic: author?.profilePicUrl || "",
          title: a.title,
          content: a.content || "",
          pinned: a.pinned || false,
          source: a.source || "manual",
          announcementType: a.announcementType || "general",
          imageUrl: a.imageUrl || "",
          createdAt: a._creationTime ? new Date(a._creationTime).toISOString() : new Date().toISOString(),
          reactions: reactionData,
        };
      })
    );

    // Sort announcements: pinned first, then by date
    announcementData.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Filter active non-template, non-completed projects
    const activeProjects = (projects as any[])
      .filter((p: any) => !p.archived && !p.isTemplate && p.status !== "completed")
      .slice(0, 15)
      .map((p: any) => ({
        id: p._id,
        clientName: p.clientName || "No client",
        projectName: p.name,
        status: p.status,
        ticketCount: p.ticketCount ?? 0,
        completedTicketCount: p.completedTicketCount ?? 0,
      }));

    // Generate birthday & anniversary announcements dynamically (not stored)
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const autoAnnouncements: Array<{
      id: string;
      authorId: string;
      authorName: string;
      title: string;
      content: string;
      pinned: boolean;
      source: string;
      announcementType: string;
      createdAt: string;
    }> = [];

    let autoIdx = 1;
    for (const member of teamMembers) {
      if (!member.active) continue;

      // Birthdays (next 14 days)
      if (member.birthday) {
        try {
          const bday = new Date(member.birthday + "T00:00:00");
          if (isNaN(bday.getTime())) continue;
          const bdayMonth = bday.getMonth();
          const bdayDate = bday.getDate();
          const thisYearBday = new Date(today.getFullYear(), bdayMonth, bdayDate);
          let diff = Math.ceil(
            (thisYearBday.getTime() - new Date(today.getFullYear(), todayMonth, todayDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diff < 0) diff += 365;

          if (diff <= 14) {
            const display = diff === 0 ? "Today!" : diff === 1 ? "Tomorrow" : `In ${diff} days`;
            autoAnnouncements.push({
              id: `auto-birthday-${autoIdx++}`,
              authorId: "",
              authorName: "System",
              title: `${member.name}'s Birthday`,
              content: display,
              pinned: diff === 0,
              source: "auto",
              announcementType: "birthday",
              createdAt: today.toISOString(),
            });
          }
        } catch { /* skip bad date */ }
      }

      // Anniversaries (next 14 days)
      if (member.startDate) {
        try {
          const start = new Date(member.startDate + "T00:00:00");
          if (isNaN(start.getTime())) continue;
          const startMonth = start.getMonth();
          const startDate = start.getDate();
          let nextAnniversaryYear = today.getFullYear();
          const thisYearAnniv = new Date(nextAnniversaryYear, startMonth, startDate);
          const todayFlat = new Date(nextAnniversaryYear, todayMonth, todayDate);
          let diff = Math.ceil((thisYearAnniv.getTime() - todayFlat.getTime()) / (1000 * 60 * 60 * 24));
          if (diff < 0) {
            diff += 365;
            nextAnniversaryYear++;
          }
          const years = nextAnniversaryYear - start.getFullYear();
          if (years < 1) continue;

          if (diff <= 14) {
            const display = diff === 0
              ? `Today! (${years} year${years > 1 ? "s" : ""})`
              : diff === 1
              ? `Tomorrow (${years} year${years > 1 ? "s" : ""})`
              : `In ${diff} days (${years} year${years > 1 ? "s" : ""})`;
            autoAnnouncements.push({
              id: `auto-anniversary-${autoIdx++}`,
              authorId: "",
              authorName: "System",
              title: `${member.name}'s Work Anniversary`,
              content: display,
              pinned: diff === 0,
              source: "auto",
              announcementType: "anniversary",
              createdAt: today.toISOString(),
          });
        }
        } catch { /* skip bad date */ }
      }
    }

    // Merge: pinned first, then auto announcements (birthdays/anniversaries), then manual by date
    const allAnnouncements = [...autoAnnouncements, ...announcementData]
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Auto announcements (birthdays/anniversaries) go before manual
        if (a.source === "auto" && b.source !== "auto") return -1;
        if (a.source !== "auto" && b.source === "auto") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    // Build calendar: merge custom events + birthdays + anniversaries
    const calendarEntries: Array<{
      date: string;
      title: string;
      type: string;
    }> = [];

    // Custom events (holidays, etc.) — expand recurring ones
    for (const ev of calendarEvents as any[]) {
      try {
        const baseDateStr = ev.eventDate as string;
        if (!baseDateStr) continue;
        const baseDate = new Date(baseDateStr + "T00:00:00");
        if (isNaN(baseDate.getTime())) continue;
        const recurrence = (ev.recurrence as string) || "none";
        const title = ev.title as string;
        const type = ev.eventType as string;

        if (recurrence === "yearly") {
          for (let yr = today.getFullYear(); yr <= today.getFullYear() + 1; yr++) {
            calendarEntries.push({
              date: new Date(yr, baseDate.getMonth(), baseDate.getDate()).toISOString().split("T")[0],
              title,
              type,
            });
          }
        } else if (recurrence === "quarterly") {
          for (let q = 0; q < 5; q++) {
            const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + q * 3, baseDate.getDate());
            if (d.getFullYear() >= today.getFullYear()) {
              calendarEntries.push({ date: d.toISOString().split("T")[0], title, type });
            }
          }
        } else if (recurrence === "monthly") {
          for (let m = 0; m < 3; m++) {
            const d = new Date(today.getFullYear(), today.getMonth() + m, baseDate.getDate());
            calendarEntries.push({ date: d.toISOString().split("T")[0], title, type });
          }
        } else if (recurrence === "weekly") {
          const startDay = baseDate.getDay();
          const start = new Date(today);
          const daysUntil = (startDay - start.getDay() + 7) % 7;
          start.setDate(start.getDate() + daysUntil);
          for (let w = 0; w < 13; w++) {
            const d = new Date(start);
            d.setDate(start.getDate() + w * 7);
            calendarEntries.push({ date: d.toISOString().split("T")[0], title, type });
          }
        } else {
          calendarEntries.push({ date: baseDateStr, title, type });
        }
      } catch {
        // Skip events with bad date data
      }
    }

    // Auto birthdays & anniversaries for current + next 2 months
    for (const member of teamMembers) {
      if (!member.active) continue;

      if (member.birthday) {
        try {
          const bday = new Date(member.birthday + "T00:00:00");
          if (!isNaN(bday.getTime())) {
            const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
            const nextYear = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
            for (const d of [thisYear, nextYear]) {
              calendarEntries.push({
                date: d.toISOString().split("T")[0],
                title: `${member.name}'s Birthday`,
                type: "birthday",
              });
            }
          }
        } catch { /* skip */ }
      }

      if (member.startDate) {
        try {
          const start = new Date(member.startDate + "T00:00:00");
          if (!isNaN(start.getTime())) {
            for (let yr = today.getFullYear(); yr <= today.getFullYear() + 1; yr++) {
              const years = yr - start.getFullYear();
              if (years < 1) continue;
              calendarEntries.push({
                date: new Date(yr, start.getMonth(), start.getDate()).toISOString().split("T")[0],
                title: `${member.name}'s Anniversary — ${years} Year${years > 1 ? "s" : ""}!`,
                type: "anniversary",
              });
            }
          }
        } catch { /* skip */ }
      }
    }

    // Deduplicate and sort by date
    const seen = new Set<string>();
    const dedupedCalendar = calendarEntries.filter((e) => {
      const key = `${e.date}|${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    dedupedCalendar.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      personalNote,
      weeklyQuote,
      announcements: allAnnouncements,
      projects: activeProjects,
      calendar: dedupedCalendar,
      changelog,
    });
  } catch (error) {
    console.error("Bulletin fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load bulletin" },
      { status: 500 }
    );
  }
}
