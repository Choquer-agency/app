import Anthropic from "@anthropic-ai/sdk";
import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { getMemberMeetingData } from "./commitments";
import { getLangfuse, flushLangfuse } from "./langfuse";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// === Types ===

export interface BriefingQuestion {
  topic: string;
  question: string;
  dataContext?: string; // deprecated — no longer generated
  category: "red_flag" | "accountability" | "coaching" | "recognition" | "planning";
  suggestedFollowUp: string;
}

export interface BriefingObservation {
  observation: string;
  severity: "info" | "warning" | "critical";
}

export interface BriefingOutput {
  questions: BriefingQuestion[];
  observations: BriefingObservation[];
  memberSummary: string;
}

export interface BriefingResult {
  briefing: BriefingOutput;
  generationMeta: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    traceId: string;
  };
  rawDebug?: {
    systemPrompt: string;
    userPrompt: string;
    rawOutput: string;
  };
}

// === Period date range helper ===

function getPeriodRange(period: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  let start: Date;
  let end: Date = new Date(now);
  end.setHours(23, 59, 59, 999);
  let label = period;

  switch (period) {
    case "last_week": {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - diffToMonday);
      start = new Date(thisMonday);
      start.setDate(thisMonday.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 4);
      end.setHours(23, 59, 59, 999);
      label = "Last Week";
      break;
    }
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = "This Month";
      break;
    case "last_month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      label = "Last Month";
      break;
    case "this_year":
      start = new Date(now.getFullYear(), 0, 1);
      label = "This Year";
      break;
    default: {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start = new Date(now);
      start.setDate(now.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      label = "This Week";
      break;
    }
  }

  return { start, end, label };
}

// === Data Collection ===

async function collectBriefingData(teamMemberId: string, period: string) {
  const convex = getConvexClient();
  const { start, end, label } = getPeriodRange(period);
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  // 1. Core meeting data (reliability, work metrics, ticket lists)
  const meetingData = await getMemberMeetingData(teamMemberId, period);

  // 2. Team member info
  const member = await convex.query(api.teamMembers.getById, { id: teamMemberId as any });

  // 3. Timesheet detail for the period
  const timesheetEntries = await convex.query(api.timesheetEntries.listByMember, {
    teamMemberId: teamMemberId as any,
    startDate: startStr,
    endDate: endStr,
    limit: 200,
  });

  // 4. All assigned tickets
  const allTickets = await convex.query(api.tickets.listByAssignee, {
    teamMemberId: teamMemberId as any,
    limit: 500,
  });

  // 5. Ticket activity + comments for relevant tickets (overdue + in-progress + recently closed)
  const relevantTicketIds = new Set<string>();
  const allTicketsList = allTickets as any[];
  const closedInPeriod = allTicketsList.filter((t) =>
    t.status === "closed" && t.closedAt &&
    t.closedAt >= start.toISOString() && t.closedAt <= end.toISOString()
  );
  const openTickets = allTicketsList.filter((t) => t.status !== "closed" && !t.archived);

  for (const t of [...openTickets, ...closedInPeriod]) {
    relevantTicketIds.add(t._id);
  }

  const ticketDetails: Array<{
    id: string;
    ticketNumber: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    clientName: string | null;
    closedAt: string | null;
    createdAt: string;
    activity: any[];
    comments: any[];
  }> = [];

  for (const ticketId of relevantTicketIds) {
    const ticket = allTicketsList.find((t: any) => t._id === ticketId);
    if (!ticket) continue;

    let activity: any[] = [];
    let comments: any[] = [];
    try {
      activity = await convex.query(api.ticketActivity.listByTicket, {
        ticketId: ticketId as any,
        limit: 20,
      }) as any[];
      // Filter to period
      activity = activity.filter((a: any) =>
        a._creationTime >= start.getTime() && a._creationTime <= end.getTime()
      );
    } catch {}

    try {
      comments = await convex.query(api.ticketComments.listByTicket, {
        ticketId: ticketId as any,
        limit: 20,
      }) as any[];
    } catch {}

    ticketDetails.push({
      id: ticket._id,
      ticketNumber: ticket.ticketNumber || "",
      title: ticket.title || "",
      status: ticket.status || "",
      priority: ticket.priority || "normal",
      dueDate: ticket.dueDate || null,
      clientName: ticket.clientName || null,
      closedAt: ticket.closedAt || null,
      createdAt: new Date(ticket._creationTime).toISOString(),
      activity,
      comments,
    });
  }

  // 6. Client distribution
  const clientMap = new Map<string, { name: string; ticketCount: number; overdueCount: number }>();
  for (const t of openTickets) {
    const clientId = t.clientId || "internal";
    const clientName = t.clientName || "Internal";
    if (!clientMap.has(clientId)) {
      clientMap.set(clientId, { name: clientName, ticketCount: 0, overdueCount: 0 });
    }
    const entry = clientMap.get(clientId)!;
    entry.ticketCount++;
    if (t.dueDate && t.dueDate < new Date().toISOString().split("T")[0]) {
      entry.overdueCount++;
    }
  }

  // 7. Past meeting transcripts
  let pastTranscripts: any[] = [];
  try {
    const notes = await convex.query(api.meetingNotes.listByMember, {
      teamMemberId: teamMemberId as any,
    });
    pastTranscripts = (notes as any[])
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 4)
      .map((n) => ({
        date: n.meetingDate,
        summary: n.summary || (n.transcript ? n.transcript.slice(0, 800) : ""),
        type: n.interactionType,
      }));
  } catch {}

  // 8. Past briefings
  let pastBriefings: any[] = [];
  try {
    const briefings = await convex.query(api.meetingBriefings.listByMember, {
      teamMemberId: teamMemberId as any,
      limit: 2,
    });
    pastBriefings = (briefings as any[]).map((b) => ({
      date: b.meetingDate,
      period: b.period,
      summary: b.briefingData?.memberSummary || "",
      questions: b.briefingData?.questions?.map((q: any) => q.topic) || [],
    }));
  } catch {}

  // 9. Timesheet change requests (corrections) — even 1 is a red flag
  let timesheetChangeRequests: any[] = [];
  try {
    const changes = await convex.query(api.timesheetChangeRequests.listByMember, {
      teamMemberId: teamMemberId as any,
      limit: 50,
    });
    // Filter to period
    timesheetChangeRequests = (changes as any[]).filter((c) => {
      const created = new Date(c._creationTime).toISOString().split("T")[0];
      return created >= startStr && created <= endStr;
    });
  } catch {}

  // 10. Question templates
  let questionTemplates: any[] = [];
  try {
    const templates = await convex.query(api.meetingQuestionTemplates.listByMember, {
      teamMemberId: teamMemberId as any,
    });
    const isFirstMondayOfMonth = new Date().getDate() <= 7 && new Date().getDay() === 1;
    questionTemplates = (templates as any[])
      .filter((t) => t.active && (t.frequency === "weekly" || (t.frequency === "monthly" && isFirstMondayOfMonth)))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((t) => ({ question: t.question, frequency: t.frequency }));
  } catch {}

  // 11. Slack bot responsiveness — how often the bot messaged them vs how often they replied
  const slackActivity = {
    botMessagesSent: 0,      // bot → member (eod_checkin, weekly_summary, team_dm FROM bot)
    memberReplies: 0,        // member → bot (eod_reply)
    eodCheckinsSent: 0,      // bot EOD check-ins specifically
    eodRepliesReceived: 0,   // member replies to EOD specifically
    recentMissedCheckins: [] as string[], // dates of EOD check-ins with no reply found
    sampleReplies: [] as string[],
  };
  try {
    const slackMsgs = await convex.query(api.slackMessages.listByMember, {
      teamMemberId: teamMemberId as any,
      limit: 200,
    });
    const inPeriod = (slackMsgs as any[]).filter((m) =>
      m._creationTime >= start.getTime() && m._creationTime <= end.getTime()
    );
    const checkins = inPeriod.filter((m) => m.messageType === "eod_checkin");
    const replies = inPeriod.filter((m) => m.messageType === "eod_reply");
    slackActivity.eodCheckinsSent = checkins.length;
    slackActivity.eodRepliesReceived = replies.length;
    slackActivity.botMessagesSent = inPeriod.filter((m) =>
      m.messageType === "eod_checkin" || m.messageType === "weekly_summary"
    ).length;
    slackActivity.memberReplies = replies.length;
    slackActivity.sampleReplies = replies
      .slice(0, 3)
      .map((r) => (r.messageText || "").slice(0, 200));

    // Find EOD check-ins with no reply within 24h — sign of non-engagement
    for (const c of checkins) {
      const checkinDate = new Date(c._creationTime);
      const replyWindow = checkinDate.getTime() + 24 * 60 * 60 * 1000;
      const gotReply = replies.some(
        (r) => r._creationTime >= c._creationTime && r._creationTime <= replyWindow
      );
      if (!gotReply) {
        slackActivity.recentMissedCheckins.push(checkinDate.toISOString().split("T")[0]);
      }
    }
  } catch {}

  // 12. Blocker escalations reported by this member in period
  let blockerEscalations: any[] = [];
  try {
    // No listByMember query — scan unacknowledged + filter, plus check ticket-level for member's tickets
    // Fallback: iterate member's tickets and collect escalations
    const memberTicketIds = allTicketsList.slice(0, 50).map((t: any) => t._id);
    const allBlockers: any[] = [];
    for (const tid of memberTicketIds) {
      try {
        const b = await convex.query(api.blockerEscalations.listByTicket, {
          ticketId: tid as any,
        }) as any[];
        for (const esc of b) {
          if (
            esc.reportedById === teamMemberId &&
            esc._creationTime >= start.getTime() &&
            esc._creationTime <= end.getTime()
          ) {
            const ticket = allTicketsList.find((t: any) => t._id === esc.ticketId);
            allBlockers.push({
              ticketNumber: ticket?.ticketNumber || "unknown",
              title: ticket?.title || "",
              description: esc.blockerDescription,
              acknowledged: esc.acknowledged,
              resolved: !!esc.resolvedAt,
              date: new Date(esc._creationTime).toISOString().split("T")[0],
            });
          }
        }
      } catch {}
    }
    blockerEscalations = allBlockers;
  } catch {}

  // 13. Projects the member is on
  let memberProjects: any[] = [];
  try {
    const projects = await convex.query(api.projects.listByMember, {
      teamMemberId: teamMemberId as any,
    });
    const today = new Date().toISOString().split("T")[0];
    memberProjects = (projects as any[]).map((p) => {
      const projectTickets = allTicketsList.filter(
        (t: any) => t.projectId === p._id && !t.archived
      );
      const overdue = projectTickets.filter(
        (t: any) => t.status !== "closed" && t.dueDate && t.dueDate < today
      );
      return {
        id: p._id,
        name: p.name,
        clientName: p.clientName,
        status: p.status,
        dueDate: p.dueDate,
        ticketCount: projectTickets.length,
        overdueCount: overdue.length,
      };
    });
  } catch {}

  // 14. Sub-ticket grouping — separate epics from sub-tickets
  const ticketParentMap = new Map<string, string>(); // subTicketId → parentTicketId
  for (const t of allTicketsList) {
    if (t.parentTicketId) {
      ticketParentMap.set(t._id, t.parentTicketId);
    }
  }
  const openEpics = openTickets.filter((t: any) => !t.parentTicketId);
  const openSubTickets = openTickets.filter((t: any) => !!t.parentTicketId);
  const ticketGrouping = {
    totalOpen: openTickets.length,
    openEpics: openEpics.length,
    openSubTickets: openSubTickets.length,
  };

  return {
    member: member as any,
    period: { start: startStr, end: endStr, label },
    meetingData,
    timesheetEntries: timesheetEntries as any[],
    ticketDetails,
    closedInPeriod: closedInPeriod.length,
    openTickets: openTickets.length,
    clientDistribution: Array.from(clientMap.values()),
    pastTranscripts,
    pastBriefings,
    questionTemplates,
    timesheetChangeRequests,
    slackActivity,
    blockerEscalations,
    memberProjects,
    ticketGrouping,
  };
}

// === Prompt Building ===

function buildPrompt(data: Awaited<ReturnType<typeof collectBriefingData>>): { system: string; user: string } {
  const system = `You are a management briefing assistant for Choquer Agency, a digital marketing agency.
You are preparing a Monday morning 1-on-1 meeting briefing for the agency owner (Bryce) about a specific team member.

IMPORTANT CONTEXT: Bryce opens this briefing on-screen while the team member is on the call. The team member SEES everything. The briefing must be:
- Direct and data-driven — reference specific ticket numbers, dates, and metrics
- Constructive — stern when needed, but frame issues as solvable. Acknowledge wins early.
- Motivational — set the tone for a productive week, don't demoralize them
- Scannable — short, punchy points. No essays. The question is the most important part of each point.

Rules:
- Reference specific ticket numbers (CHQ-XXX), client names, dates, and metrics
- Flag anomalies: timesheet change requests (even 1 is a red flag), low utilization, overdue tickets, stale tickets, Slack bot non-engagement
- Do NOT care about missing clock-in days or not hitting 40 hours — team is hourly, fewer hours = lower cost. DO care about timesheet correction requests.
- Be direct: "CHQ-892 has been overdue for 12 days" not "How are things going?"
- Slack bot responsiveness: Bryce encourages team to respond to the Slackbot EOD check-ins. If a member ignored multiple check-ins, surface it as a coaching point (e.g. "The bot checked in with you 5 times and you didn't reply once — what's blocking you from engaging with it?"). Low response rate is a behavior signal.
- Sub-tickets vs epics: Treat sub-tickets (tickets with a parent) as work under an epic. When counting workload, cite BOTH epic count and total sub-ticket count to avoid inflating "X open tickets" when most are sub-tasks.
- Projects: If assigned to projects with overdue tickets, surface project-level context (e.g. "You're on 3 projects; the Acme SEO project has 4 overdue tickets").
- Blockers: If they reported blockers that went unresolved, follow up on resolution. If zero blockers but overdue tickets exist, probe why they didn't flag them.
- Prioritize: recognition first (set positive tone), then red flags, accountability, coaching, planning
- Generate 5-8 discussion points, ordered by: recognition → red_flag → accountability → coaching → planning
- Keep each question to 1-2 sentences max. No long paragraphs.
- CRITICAL: ONLY reference information explicitly provided in the data below. NEVER fabricate or assume prior meeting discussions, accountability plans, or commitments that are not in the provided transcripts or briefings. If past data is limited, say so — do not invent history.
- The memberSummary is a 2-3 sentence overview for Bryce. Be honest but balanced — lead with capability, then address what needs work.

Categories:
- red_flag: Overdue client tickets, timesheet correction requests, client at risk
- accountability: Following up on specific deliverables and commitments
- coaching: Growth opportunities, skill development, work patterns to improve
- recognition: Something they did well — always include at least one
- planning: Forward-looking priorities for the week

You MUST respond with valid JSON matching this exact schema:
{
  "questions": [
    {
      "topic": "Short topic name (e.g. ticket number or theme)",
      "question": "The specific, direct question to ask — 1-2 sentences max",
      "category": "red_flag|accountability|coaching|recognition|planning",
      "suggestedFollowUp": "One follow-up question if they can't answer"
    }
  ],
  "observations": [
    {
      "observation": "A concise pattern or insight about their work",
      "severity": "info|warning|critical"
    }
  ],
  "memberSummary": "2-3 sentence balanced assessment — capability first, then areas to address"
}`;

  // Build the user prompt with all the data
  const sections: string[] = [];

  // Member info
  sections.push(`== TEAM MEMBER ==
Name: ${data.member?.name || "Unknown"}
Role: ${data.member?.role || "Unknown"}
Pay Type: ${data.member?.payType || "hourly"}
Available Hours/Week: ${data.member?.availableHoursPerWeek ?? 40}
Period: ${data.period.label} (${data.period.start} to ${data.period.end})
Meeting Date: ${new Date().toISOString().split("T")[0]}
Is Monthly Review: ${new Date().getDate() <= 7 ? "Yes — first week of the month" : "No — regular weekly"}`);

  // Question templates (themes)
  if (data.questionTemplates.length > 0) {
    sections.push(`== OWNER'S QUESTION THEMES (use as guides, not literal questions) ==
${data.questionTemplates.map((q, i) => `${i + 1}. [${q.frequency}] ${q.question}`).join("\n")}`);
  }

  // Reliability & work metrics
  const r = data.meetingData.reliability;
  const w = data.meetingData.workMetrics;
  sections.push(`== RELIABILITY & WORK METRICS ==
Reliability Score: ${r.score}% (${r.onTime} on time, ${r.missed} missed, ${r.total} total with due dates in period)
Logged Hours: ${w.loggedHours}h
Clocked Hours: ${w.clockedHours}h
Utilization: ${w.utilizationPct}%
Tickets Closed (this period): ${w.ticketsClosed}
Tickets Open: ${w.ticketsOpen}
Avg Resolution: ${w.avgResolutionHours}h (${(w.avgResolutionHours / 24).toFixed(1)} days)
Velocity: ${w.avgClosedPerWeek} tickets/week`);

  // Timesheet detail
  if (data.timesheetEntries.length > 0) {
    const tsRows = data.timesheetEntries
      .filter((e) => !e.isSickDay && !e.isVacation)
      .map((e) => {
        const clockIn = e.clockInTime ? new Date(e.clockInTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "?";
        const clockOut = e.clockOutTime ? new Date(e.clockOutTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "Still clocked in";
        const hours = e.workedMinutes ? (e.workedMinutes / 60).toFixed(1) : "?";
        const issues = e.issues?.length ? ` [ISSUES: ${e.issues.join(", ")}]` : "";
        return `  ${e.date}: ${clockIn} → ${clockOut} (${hours}h worked)${issues}`;
      });
    const sickDays = data.timesheetEntries.filter((e) => e.isSickDay);
    const vacationDays = data.timesheetEntries.filter((e) => e.isVacation);
    sections.push(`== TIMESHEET DETAIL ==
${tsRows.join("\n")}
${sickDays.length > 0 ? `Sick days: ${sickDays.map((e) => e.date).join(", ")}` : ""}
${vacationDays.length > 0 ? `Vacation: ${vacationDays.map((e) => e.date).join(", ")}` : ""}`);
  }

  // Overdue tickets
  if (data.meetingData.overdue.length > 0) {
    const overdueRows = data.meetingData.overdue.map((t) => {
      const daysOverdue = t.dueDate
        ? Math.ceil((Date.now() - new Date(t.dueDate + "T23:59:59").getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return `  ${t.ticketNumber} — "${t.title}" | Client: ${t.clientName || "Internal"} | Due: ${t.dueDate} (${daysOverdue}d overdue) | Status: ${t.status}`;
    });
    sections.push(`== OVERDUE TICKETS (${data.meetingData.overdue.length}) ==
${overdueRows.join("\n")}`);
  }

  // In progress tickets
  if (data.meetingData.inProgress.length > 0) {
    const ipRows = data.meetingData.inProgress.map((t) =>
      `  ${t.ticketNumber} — "${t.title}" | Client: ${t.clientName || "Internal"} | Due: ${t.dueDate || "No due date"}`
    );
    sections.push(`== IN PROGRESS TICKETS (${data.meetingData.inProgress.length}) ==
${ipRows.join("\n")}`);
  }

  // Backlog tickets
  if (data.meetingData.needsAttention.length > 0) {
    const naRows = data.meetingData.needsAttention.map((t) =>
      `  ${t.ticketNumber} — "${t.title}" | Client: ${t.clientName || "Internal"} | Due: ${t.dueDate || "No due date"}`
    );
    sections.push(`== BACKLOG / STUCK TICKETS (${data.meetingData.needsAttention.length}) ==
${naRows.join("\n")}`);
  }

  // Due this week
  if (data.meetingData.dueThisWeek.length > 0) {
    const dwRows = data.meetingData.dueThisWeek.map((t) =>
      `  ${t.ticketNumber} — "${t.title}" | Client: ${t.clientName || "Internal"} | Due: ${t.dueDate}`
    );
    sections.push(`== DUE THIS WEEK (${data.meetingData.dueThisWeek.length}) ==
${dwRows.join("\n")}`);
  }

  // Recently closed tickets
  if (data.closedInPeriod > 0) {
    const closedDetails = data.ticketDetails
      .filter((t) => t.closedAt)
      .map((t) => {
        const resHours = t.closedAt
          ? ((new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60)).toFixed(1)
          : "?";
        return `  ${t.ticketNumber} — "${t.title}" | Client: ${t.clientName || "Internal"} | Resolution: ${resHours}h (${(Number(resHours) / 24).toFixed(1)}d)`;
      });
    sections.push(`== RECENTLY CLOSED (${data.closedInPeriod}) ==
${closedDetails.join("\n")}`);
  }

  // Ticket activity highlights
  const activityHighlights = data.ticketDetails
    .filter((t) => t.activity.length > 0)
    .flatMap((t) => t.activity.map((a: any) => ({
      ticket: t.ticketNumber,
      title: t.title,
      action: a.action || a.type || "update",
      oldValue: a.oldValue,
      newValue: a.newValue,
      date: a._creationTime ? new Date(a._creationTime).toISOString().split("T")[0] : "",
    })));
  if (activityHighlights.length > 0) {
    sections.push(`== TICKET ACTIVITY IN PERIOD ==
${activityHighlights.map((a) => `  ${a.date} ${a.ticket} "${a.title}": ${a.action} ${a.oldValue ? `${a.oldValue} → ${a.newValue}` : a.newValue || ""}`).join("\n")}`);
  }

  // Recent comments on open tickets
  const recentComments = data.ticketDetails
    .filter((t) => t.comments.length > 0 && t.status !== "closed")
    .flatMap((t) => t.comments.slice(-3).map((c: any) => ({
      ticket: t.ticketNumber,
      author: c.authorName || "Unknown",
      content: (c.content || "").slice(0, 200),
      date: c._creationTime ? new Date(c._creationTime).toISOString().split("T")[0] : "",
    })));
  if (recentComments.length > 0) {
    sections.push(`== RECENT COMMENTS ON OPEN TICKETS ==
${recentComments.map((c) => `  ${c.date} ${c.ticket} (${c.author}): "${c.content}"`).join("\n")}`);
  }

  // Timesheet change requests
  if (data.timesheetChangeRequests.length > 0) {
    sections.push(`== TIMESHEET CORRECTION REQUESTS (${data.timesheetChangeRequests.length}) — IMPORTANT: Even 1 correction request is a red flag ==
${data.timesheetChangeRequests.map((c: any) => {
  const date = new Date(c._creationTime).toISOString().split("T")[0];
  return `  ${date}: ${c.status} — requested ${c.proposedClockIn ? "clock-in change" : ""}${c.proposedClockOut ? " + clock-out change" : ""}${c.reason ? ` (reason: ${c.reason})` : ""}`;
}).join("\n")}`);
  } else {
    sections.push(`== TIMESHEET CORRECTION REQUESTS ==
No correction requests this period — clean timesheet.`);
  }

  // Client distribution
  if (data.clientDistribution.length > 0) {
    sections.push(`== CLIENT DISTRIBUTION ==
${data.clientDistribution.map((c) => `  ${c.name}: ${c.ticketCount} open tickets${c.overdueCount > 0 ? ` (${c.overdueCount} overdue!)` : ""}`).join("\n")}`);
  }

  // Past meeting context
  if (data.pastTranscripts.length > 0) {
    sections.push(`== PAST MEETING CONTEXT ==
${data.pastTranscripts.map((t) => `  ${t.date} (${t.type}): ${t.summary.slice(0, 500)}`).join("\n\n")}`);
  }

  // Past briefing follow-ups
  if (data.pastBriefings.length > 0) {
    sections.push(`== PREVIOUS BRIEFING FOLLOW-UPS ==
${data.pastBriefings.map((b) => `  ${b.date} (${b.period}): ${b.summary}\n  Topics covered: ${b.questions.join(", ")}`).join("\n\n")}`);
  }

  // Ticket grouping — epics vs sub-tickets
  sections.push(`== TICKET GROUPING ==
Total Open: ${data.ticketGrouping.totalOpen}
  - Epics (top-level tickets): ${data.ticketGrouping.openEpics}
  - Sub-tickets (under an epic): ${data.ticketGrouping.openSubTickets}
Note: When referring to workload, prefer epic count. Sub-tickets are sub-tasks and inflate raw ticket counts.`);

  // Slack bot responsiveness
  const slack = data.slackActivity;
  const responseRate = slack.eodCheckinsSent > 0
    ? Math.round((slack.eodRepliesReceived / slack.eodCheckinsSent) * 100)
    : null;
  sections.push(`== SLACK BOT ENGAGEMENT ==
Bot EOD check-ins sent to member: ${slack.eodCheckinsSent}
Member replies to EOD check-ins: ${slack.eodRepliesReceived}
EOD response rate: ${responseRate !== null ? `${responseRate}%` : "N/A"}
Total bot messages sent (EOD + weekly summaries): ${slack.botMessagesSent}
Total member replies: ${slack.memberReplies}
${slack.recentMissedCheckins.length > 0 ? `Missed check-in dates (no reply within 24h): ${slack.recentMissedCheckins.join(", ")}` : "All check-ins got a response within 24h."}
${slack.sampleReplies.length > 0 ? `Sample replies: ${slack.sampleReplies.map((r) => `"${r}"`).join(" | ")}` : "No reply content to sample."}
IMPORTANT: Bryce actively encourages team to engage with the Slack bot. A ${responseRate !== null && responseRate < 50 ? "LOW" : "healthy"} response rate reflects engagement with accountability tooling.`);

  // Blocker escalations
  if (data.blockerEscalations.length > 0) {
    sections.push(`== BLOCKERS REPORTED (${data.blockerEscalations.length}) ==
${data.blockerEscalations.map((b: any) =>
  `  ${b.date} ${b.ticketNumber} — "${b.title}" | ${b.resolved ? "RESOLVED" : b.acknowledged ? "Acknowledged (unresolved)" : "UNACKNOWLEDGED"}: ${b.description.slice(0, 200)}`
).join("\n")}`);
  } else {
    sections.push(`== BLOCKERS REPORTED ==
No blockers reported this period. ${data.meetingData.overdue.length > 0 ? `NOTE: ${data.meetingData.overdue.length} overdue ticket(s) exist but no blocker was raised — probe whether they were stuck silently.` : ""}`);
  }

  // Projects
  if (data.memberProjects.length > 0) {
    sections.push(`== PROJECTS ASSIGNED (${data.memberProjects.length}) ==
${data.memberProjects.map((p: any) =>
  `  "${p.name}"${p.clientName ? ` (${p.clientName})` : ""} | Status: ${p.status || "active"} | ${p.ticketCount} tickets${p.overdueCount > 0 ? ` (${p.overdueCount} OVERDUE)` : ""}${p.dueDate ? ` | Project due: ${p.dueDate}` : ""}`
).join("\n")}`);
  }

  return { system, user: sections.join("\n\n") };
}

// === Generation ===

export async function generateBriefing(teamMemberId: string, period: string): Promise<BriefingResult> {
  const startTime = Date.now();
  const traceId = `briefing-${teamMemberId}-${Date.now()}`;

  // Collect all data
  const data = await collectBriefingData(teamMemberId, period);

  // Build prompt
  const { system, user } = buildPrompt(data);

  // Langfuse trace
  const langfuse = getLangfuse();
  const trace = langfuse.trace({
    id: traceId,
    name: "meeting-briefing",
    metadata: {
      teamMemberId,
      memberName: data.member?.name,
      period,
      periodLabel: data.period.label,
    },
  });

  const generation = trace.generation({
    name: "generate-briefing",
    model: "claude-opus-4-6",
    input: { system: system.slice(0, 500), userLength: user.length },
    metadata: { inputChars: user.length },
  });

  // Call Claude
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: user }],
  });

  const durationMs = Date.now() - startTime;
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  // Log to Langfuse
  generation.end({
    output: response.content[0]?.type === "text" ? response.content[0].text.slice(0, 500) : "",
    usage: { input: inputTokens, output: outputTokens },
    metadata: { durationMs },
  });
  await flushLangfuse();

  // Parse response
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  let briefing: BriefingOutput;
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    briefing = JSON.parse(cleaned);
  } catch {
    // Fallback if JSON parsing fails
    briefing = {
      questions: [{
        topic: "Briefing Generation",
        question: "The AI briefing could not be parsed. Here is the raw output for review.",
        dataContext: text.slice(0, 500),
        category: "planning",
        suggestedFollowUp: "Review the raw output and try regenerating.",
      }],
      observations: [],
      memberSummary: "Briefing generation encountered a parsing issue.",
    };
  }

  return {
    briefing,
    generationMeta: {
      model: "claude-opus-4-6",
      inputTokens,
      outputTokens,
      durationMs,
      traceId,
    },
    rawDebug: {
      systemPrompt: system,
      userPrompt: user,
      rawOutput: text,
    },
  };
}
