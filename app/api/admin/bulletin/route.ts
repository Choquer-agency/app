import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { getTeamMembers } from "@/lib/team-members";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all data in parallel
    const [noteResult, announcementsResult, projectsResult, quoteResult, calendarResult, teamMembers] = await Promise.all([
      sql`SELECT content FROM personal_notes WHERE team_member_id = ${session.teamMemberId}`,
      sql`
        SELECT a.id, a.title, a.content, a.pinned, a.created_at,
               a.author_id, a.source, a.announcement_type, a.image_url,
               tm.name AS author_name, tm.profile_pic_url AS author_pic
        FROM announcements a
        JOIN team_members tm ON tm.id = a.author_id
        WHERE (a.expires_at IS NULL OR a.expires_at > NOW())
        ORDER BY a.pinned DESC, a.created_at DESC
        LIMIT 20
      `,
      sql`
        SELECT p.id, p.name AS project_name, p.status,
               c.name AS client_name,
               (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.is_personal = false) AS ticket_count,
               (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.archived = false AND t.is_personal = false AND t.status = 'closed') AS completed_ticket_count
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.archived = false AND p.is_template = false AND p.status != 'completed'
        ORDER BY p.updated_at DESC
        LIMIT 15
      `,
      // Get the selected quote for this week (Monday-based)
      sql`
        SELECT quote, author FROM weekly_quotes
        WHERE selected = true
        ORDER BY week_start DESC
        LIMIT 1
      `,
      sql`SELECT id, title, event_date, event_type FROM calendar_events ORDER BY event_date ASC`,
      getTeamMembers(),
    ]);

    const personalNote = noteResult.rows[0]?.content || "";

    const weeklyQuote = quoteResult.rows[0]
      ? { quote: quoteResult.rows[0].quote as string, author: (quoteResult.rows[0].author as string) || "" }
      : null;

    // Fetch reactions for all announcements
    const announcementIds = announcementsResult.rows.map((r) => r.id as number);
    const reactionsMap: Record<number, Array<{ emoji: string; memberName: string; memberId: number }>> = {};
    if (announcementIds.length > 0) {
      const idList = announcementIds.join(",");
      const { rows: reactionRows } = await sql.query(
        `SELECT ar.announcement_id, ar.emoji, ar.team_member_id, tm.name AS member_name
         FROM announcement_reactions ar
         JOIN team_members tm ON tm.id = ar.team_member_id
         WHERE ar.announcement_id IN (${idList})
         ORDER BY ar.created_at ASC`
      );
      for (const r of reactionRows) {
        const annId = r.announcement_id as number;
        if (!reactionsMap[annId]) reactionsMap[annId] = [];
        reactionsMap[annId].push({
          emoji: r.emoji as string,
          memberName: r.member_name as string,
          memberId: r.team_member_id as number,
        });
      }
    }

    const announcements = announcementsResult.rows.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorPic: (r.author_pic as string) || "",
      title: r.title,
      content: r.content,
      pinned: r.pinned,
      source: r.source || "manual",
      announcementType: r.announcement_type || "general",
      imageUrl: (r.image_url as string) || "",
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      reactions: reactionsMap[r.id as number] || [],
    }));

    const projects = projectsResult.rows.map((r) => ({
      id: r.id,
      clientName: r.client_name || "No client",
      projectName: r.project_name,
      status: r.status,
      ticketCount: Number(r.ticket_count) || 0,
      completedTicketCount: Number(r.completed_ticket_count) || 0,
    }));

    // Generate birthday & anniversary announcements dynamically (not stored)
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const autoAnnouncements: Array<{
      id: number;
      authorId: number;
      authorName: string;
      title: string;
      content: string;
      pinned: boolean;
      source: string;
      announcementType: string;
      createdAt: string;
    }> = [];

    let autoId = -1;
    for (const member of teamMembers) {
      if (!member.active) continue;

      // Birthdays (next 14 days)
      if (member.birthday) {
        const bday = new Date(member.birthday + "T00:00:00");
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
            id: autoId--,
            authorId: 0,
            authorName: "System",
            title: `${member.name}'s Birthday`,
            content: display,
            pinned: diff === 0,
            source: "auto",
            announcementType: "birthday",
            createdAt: today.toISOString(),
          });
        }
      }

      // Anniversaries (next 14 days)
      if (member.startDate) {
        const start = new Date(member.startDate + "T00:00:00");
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
            id: autoId--,
            authorId: 0,
            authorName: "System",
            title: `${member.name}'s Work Anniversary`,
            content: display,
            pinned: diff === 0,
            source: "auto",
            announcementType: "anniversary",
            createdAt: today.toISOString(),
          });
        }
      }
    }

    // Merge: pinned first, then auto announcements (birthdays/anniversaries), then manual by date
    const allAnnouncements = [...autoAnnouncements, ...announcements]
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
    for (const r of calendarResult.rows) {
      const baseDate = r.event_date as Date;
      const recurrence = (r.recurrence as string) || "none";
      const title = r.title as string;
      const type = r.event_type as string;

      if (recurrence === "yearly") {
        for (let yr = today.getFullYear(); yr <= today.getFullYear() + 1; yr++) {
          calendarEntries.push({
            date: new Date(yr, baseDate.getMonth(), baseDate.getDate()).toISOString().split("T")[0],
            title,
            type,
          });
        }
      } else if (recurrence === "quarterly") {
        // Generate every 3 months from the base date, covering next 12 months
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
        // Generate weekly occurrences for next 3 months
        const startDay = baseDate.getDay();
        const start = new Date(today);
        // Find next occurrence of this weekday
        const daysUntil = (startDay - start.getDay() + 7) % 7;
        start.setDate(start.getDate() + daysUntil);
        for (let w = 0; w < 13; w++) {
          const d = new Date(start);
          d.setDate(start.getDate() + w * 7);
          calendarEntries.push({ date: d.toISOString().split("T")[0], title, type });
        }
      } else {
        // One-time event
        calendarEntries.push({
          date: baseDate.toISOString().split("T")[0],
          title,
          type,
        });
      }
    }

    // Auto birthdays & anniversaries for current + next 2 months
    for (const member of teamMembers) {
      if (!member.active) continue;

      if (member.birthday) {
        const bday = new Date(member.birthday + "T00:00:00");
        // This year's birthday
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

      if (member.startDate) {
        const start = new Date(member.startDate + "T00:00:00");
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
    }

    // Sort by date
    calendarEntries.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      personalNote,
      weeklyQuote,
      announcements: allAnnouncements,
      projects,
      calendar: calendarEntries,
    });
  } catch (error) {
    console.error("Bulletin fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load bulletin" },
      { status: 500 }
    );
  }
}
