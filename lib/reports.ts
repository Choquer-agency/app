import { sql } from "@vercel/postgres";

// === Types ===

export interface UtilizationMember {
  teamMemberId: number;
  memberName: string;
  memberColor: string;
  totalHours: number;
  availableHours: number;
  utilizationPct: number;
  byClient: Array<{ clientId: number | null; clientName: string | null; hours: number }>;
}

export interface UtilizationReport {
  members: UtilizationMember[];
  period: { start: string; end: string };
  totalTeamHours: number;
  avgUtilization: number;
}

export interface ProfitabilityClient {
  clientId: number;
  clientName: string;
  includedHours: number;
  loggedHours: number;
  overage: number;
  overageCost: number;
  monthlyRevenue: number;
  status: "ok" | "warning" | "exceeded";
}

export interface ProfitabilityTrendMonth {
  month: string;
  clients: Array<{ clientId: number; clientName: string; loggedHours: number; includedHours: number }>;
}

export interface ProfitabilityReport {
  clients: ProfitabilityClient[];
  trends: ProfitabilityTrendMonth[];
  month: string;
}

export interface VelocityResolution {
  clientId: number | null;
  clientName: string | null;
  projectId: number | null;
  projectName: string | null;
  ticketsClosed: number;
  avgResolutionHours: number;
}

export interface VelocityReport {
  avgResolution: VelocityResolution[];
  weeklyThroughput: Array<{ weekStart: string; ticketsClosed: number }>;
  statusDurations: Array<{ status: string; avgHours: number }>;
  overallAvgHours: number;
  totalClosed: number;
}

export interface PerformanceMember {
  teamMemberId: number;
  memberName: string;
  memberColor: string;
  memberProfilePicUrl: string;
  availableHoursPerWeek: number;
  ticketsClosed: number;
  avgResolutionHours: number;
  hoursLogged: number;
  overdueTickets: number;
  openTickets: number;
  avgOpenHours: number;
  onTimeCount: number;
  withDueDateCount: number;
  onTimePct: number;
}

export interface PerformanceOpenTicket {
  id: number;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  clientName: string | null;
}

export interface PerformanceReport {
  members: PerformanceMember[];
  openTickets: PerformanceOpenTicket[];
  period: { start: string; end: string };
}

export interface RevenueReport {
  currentMrr: number;
  mrrTrend: Array<{ month: string; mrr: number }>;
  revenueByCategory: Array<{ category: string; revenue: number }>;
  clientLtv: Array<{ clientId: number; clientName: string; mrr: number; monthsActive: number; ltv: number }>;
  projectedAnnualRevenue: number;
}

export interface ForecastDeadline {
  ticketId: number;
  ticketNumber: string;
  title: string;
  dueDate: string;
  status: string;
  priority: string;
  clientName: string | null;
  assigneeNames: string[];
}

export interface ForecastWorkload {
  teamMemberId: number;
  memberName: string;
  memberColor: string;
  openTickets: number;
  overdueTickets: number;
  hoursLoggedThisWeek: number;
  availableHours: number;
  remainingCapacity: number;
  capacityStatus: "overloaded" | "balanced" | "available";
}

export interface ForecastingReport {
  upcomingDeadlines: ForecastDeadline[];
  teamWorkload: ForecastWorkload[];
  deadlineHeatmap: Array<{ date: string; count: number }>;
}

// === Helpers ===

function weeksInRange(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(ms / (7 * 24 * 60 * 60 * 1000), 1);
}

// === Report Functions ===

export async function getUtilizationReport(start: string, end: string): Promise<UtilizationReport> {
  const { rows } = await sql`
    SELECT te.team_member_id, tm.name AS member_name, tm.color AS member_color,
      tm.available_hours_per_week,
      t.client_id, c.name AS client_name,
      SUM(
        EXTRACT(EPOCH FROM
          LEAST(COALESCE(te.end_time, NOW()), ${end}::timestamptz)
          - GREATEST(te.start_time, ${start}::timestamptz)
        ) / 3600.0
      ) AS hours
    FROM time_entries te
    JOIN team_members tm ON tm.id = te.team_member_id
    JOIN tickets t ON t.id = te.ticket_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE te.start_time < ${end}::timestamptz
      AND COALESCE(te.end_time, NOW()) > ${start}::timestamptz
      AND tm.active = true
    GROUP BY te.team_member_id, tm.name, tm.color, tm.available_hours_per_week, t.client_id, c.name
    ORDER BY tm.name, c.name
  `;

  const weeks = weeksInRange(start, end);
  const memberMap = new Map<number, UtilizationMember>();

  for (const row of rows) {
    const memberId = row.team_member_id as number;
    const hours = parseFloat((row.hours as string) || "0");
    const availPerWeek = parseFloat((row.available_hours_per_week as string) || "40");

    if (!memberMap.has(memberId)) {
      memberMap.set(memberId, {
        teamMemberId: memberId,
        memberName: row.member_name as string,
        memberColor: row.member_color as string,
        totalHours: 0,
        availableHours: Math.round(availPerWeek * weeks * 10) / 10,
        utilizationPct: 0,
        byClient: [],
      });
    }

    const entry = memberMap.get(memberId)!;
    entry.totalHours += hours;
    entry.byClient.push({
      clientId: (row.client_id as number) ?? null,
      clientName: (row.client_name as string) ?? null,
      hours: Math.round(hours * 100) / 100,
    });
  }

  // Also include active members with 0 hours
  const { rows: allMembers } = await sql`
    SELECT id, name, color, available_hours_per_week FROM team_members WHERE active = true
  `;
  for (const m of allMembers) {
    const id = m.id as number;
    if (!memberMap.has(id)) {
      const availPerWeek = parseFloat((m.available_hours_per_week as string) || "40");
      memberMap.set(id, {
        teamMemberId: id,
        memberName: m.name as string,
        memberColor: m.color as string,
        totalHours: 0,
        availableHours: Math.round(availPerWeek * weeks * 10) / 10,
        utilizationPct: 0,
        byClient: [],
      });
    }
  }

  const members = Array.from(memberMap.values()).map((m) => {
    m.totalHours = Math.round(m.totalHours * 100) / 100;
    m.utilizationPct = m.availableHours > 0 ? Math.round((m.totalHours / m.availableHours) * 1000) / 10 : 0;
    return m;
  }).sort((a, b) => b.totalHours - a.totalHours);

  const totalTeamHours = members.reduce((s, m) => s + m.totalHours, 0);
  const avgUtilization = members.length > 0
    ? Math.round(members.reduce((s, m) => s + m.utilizationPct, 0) / members.length * 10) / 10
    : 0;

  return { members, period: { start, end }, totalTeamHours: Math.round(totalTeamHours * 100) / 100, avgUtilization };
}

export async function getProfitabilityReport(month: string): Promise<ProfitabilityReport> {
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const monthStartISO = monthStart.toISOString();
  const monthEndISO = monthEnd.toISOString();

  // Get active clients with their package hours & revenue
  const { rows: clientRows } = await sql`
    SELECT c.id AS client_id, c.name AS client_name,
      COALESCE(SUM(COALESCE(cp.custom_hours, p.hours_included, 0)), 0) AS included_hours,
      COALESCE(SUM(COALESCE(cp.custom_price, p.default_price, 0)), 0) AS monthly_revenue
    FROM clients c
    LEFT JOIN client_packages cp ON cp.client_id = c.id AND cp.active = true
    LEFT JOIN packages p ON p.id = cp.package_id
    WHERE c.active = true
    GROUP BY c.id, c.name
    ORDER BY c.name
  `;

  // Get logged hours per client for this month
  const { rows: hoursRows } = await sql`
    SELECT t.client_id,
      SUM(
        EXTRACT(EPOCH FROM
          LEAST(COALESCE(te.end_time, NOW()), ${monthEndISO}::timestamptz)
          - GREATEST(te.start_time, ${monthStartISO}::timestamptz)
        ) / 3600.0
      ) AS logged_hours
    FROM time_entries te
    JOIN tickets t ON t.id = te.ticket_id
    WHERE t.client_id IS NOT NULL
      AND te.start_time < ${monthEndISO}::timestamptz
      AND COALESCE(te.end_time, NOW()) > ${monthStartISO}::timestamptz
    GROUP BY t.client_id
  `;

  const hoursMap = new Map<number, number>();
  for (const r of hoursRows) {
    hoursMap.set(r.client_id as number, parseFloat((r.logged_hours as string) || "0"));
  }

  const clients: ProfitabilityClient[] = clientRows.map((r) => {
    const clientId = r.client_id as number;
    const includedHours = parseFloat((r.included_hours as string) || "0");
    const monthlyRevenue = parseFloat((r.monthly_revenue as string) || "0");
    const loggedHours = Math.round((hoursMap.get(clientId) || 0) * 100) / 100;
    const overage = Math.max(0, loggedHours - includedHours);
    const hourlyRate = includedHours > 0 ? monthlyRevenue / includedHours : 0;
    const overageCost = Math.round(overage * hourlyRate * 100) / 100;
    const pctUsed = includedHours > 0 ? (loggedHours / includedHours) * 100 : 0;
    let status: "ok" | "warning" | "exceeded" = "ok";
    if (pctUsed >= 100) status = "exceeded";
    else if (pctUsed >= 80) status = "warning";

    return { clientId, clientName: r.client_name as string, includedHours, loggedHours, overage, overageCost, monthlyRevenue, status };
  }).filter((c) => c.includedHours > 0 || c.loggedHours > 0);

  // 6-month trend
  const trends: ProfitabilityTrendMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const trendStart = new Date(monthStart);
    trendStart.setMonth(trendStart.getMonth() - i);
    const trendEnd = new Date(trendStart);
    trendEnd.setMonth(trendEnd.getMonth() + 1);
    const trendStartISO = trendStart.toISOString();
    const trendEndISO = trendEnd.toISOString();

    const { rows: trendRows } = await sql`
      SELECT t.client_id, c.name AS client_name,
        SUM(
          EXTRACT(EPOCH FROM
            LEAST(COALESCE(te.end_time, NOW()), ${trendEndISO}::timestamptz)
            - GREATEST(te.start_time, ${trendStartISO}::timestamptz)
          ) / 3600.0
        ) AS logged_hours
      FROM time_entries te
      JOIN tickets t ON t.id = te.ticket_id
      LEFT JOIN clients c ON c.id = t.client_id
      WHERE t.client_id IS NOT NULL
        AND te.start_time < ${trendEndISO}::timestamptz
        AND COALESCE(te.end_time, NOW()) > ${trendStartISO}::timestamptz
      GROUP BY t.client_id, c.name
    `;

    const trendMonth = trendStart.toISOString().slice(0, 7);
    const clientsInMonth = trendRows.map((r) => {
      const clientId = r.client_id as number;
      const clientData = clientRows.find((c) => (c.client_id as number) === clientId);
      return {
        clientId,
        clientName: (r.client_name as string) || "",
        loggedHours: Math.round(parseFloat((r.logged_hours as string) || "0") * 100) / 100,
        includedHours: clientData ? parseFloat((clientData.included_hours as string) || "0") : 0,
      };
    });

    trends.push({ month: trendMonth, clients: clientsInMonth });
  }

  return { clients, trends, month: monthStart.toISOString().slice(0, 7) };
}

export async function getVelocityReport(weeks: number = 12): Promise<VelocityReport> {
  // Avg resolution time grouped by client/project
  const { rows: resRows } = await sql`
    SELECT
      t.client_id, c.name AS client_name,
      t.project_id, p.name AS project_name,
      COUNT(*) AS tickets_closed,
      AVG(EXTRACT(EPOCH FROM t.closed_at - t.created_at) / 3600.0) AS avg_resolution_hours
    FROM tickets t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.status = 'closed' AND t.closed_at IS NOT NULL
      AND t.closed_at > NOW() - make_interval(weeks => ${weeks})
      AND t.archived = false
    GROUP BY t.client_id, c.name, t.project_id, p.name
    ORDER BY avg_resolution_hours ASC
  `;

  const avgResolution: VelocityResolution[] = resRows.map((r) => ({
    clientId: (r.client_id as number) ?? null,
    clientName: (r.client_name as string) ?? null,
    projectId: (r.project_id as number) ?? null,
    projectName: (r.project_name as string) ?? null,
    ticketsClosed: r.tickets_closed as number,
    avgResolutionHours: Math.round(parseFloat((r.avg_resolution_hours as string) || "0") * 10) / 10,
  }));

  // Weekly throughput
  const { rows: throughputRows } = await sql`
    SELECT
      DATE_TRUNC('week', t.closed_at) AS week_start,
      COUNT(*) AS tickets_closed
    FROM tickets t
    WHERE t.status = 'closed' AND t.closed_at IS NOT NULL
      AND t.closed_at > NOW() - make_interval(weeks => ${weeks})
      AND t.archived = false
    GROUP BY DATE_TRUNC('week', t.closed_at)
    ORDER BY week_start ASC
  `;

  const weeklyThroughput = throughputRows.map((r) => ({
    weekStart: (r.week_start as Date).toISOString().slice(0, 10),
    ticketsClosed: r.tickets_closed as number,
  }));

  // Status duration breakdown
  const { rows: durationRows } = await sql`
    SELECT
      ta.new_value AS status,
      AVG(
        EXTRACT(EPOCH FROM (
          COALESCE(
            (SELECT MIN(ta2.created_at) FROM ticket_activity ta2
             WHERE ta2.ticket_id = ta.ticket_id
               AND ta2.action_type = 'status_change'
               AND ta2.created_at > ta.created_at),
            NOW()
          ) - ta.created_at
        )) / 3600.0
      ) AS avg_hours_in_status
    FROM ticket_activity ta
    WHERE ta.action_type = 'status_change'
      AND ta.created_at > NOW() - make_interval(weeks => ${weeks})
    GROUP BY ta.new_value
    ORDER BY avg_hours_in_status DESC
  `;

  const statusDurations = durationRows.map((r) => ({
    status: r.status as string,
    avgHours: Math.round(parseFloat((r.avg_hours_in_status as string) || "0") * 10) / 10,
  }));

  const totalClosed = avgResolution.reduce((s, r) => s + r.ticketsClosed, 0);
  const overallAvgHours = totalClosed > 0
    ? Math.round(avgResolution.reduce((s, r) => s + r.avgResolutionHours * r.ticketsClosed, 0) / totalClosed * 10) / 10
    : 0;

  return { avgResolution, weeklyThroughput, statusDurations, overallAvgHours, totalClosed };
}

export async function getPerformanceReport(start: string, end: string, memberId?: number): Promise<PerformanceReport> {
  const memberFilter = memberId ? memberId : null;

  // Query 1: Tickets closed per member + avg resolution
  const { rows: closedRows } = await sql`
    SELECT ta.team_member_id,
      COUNT(*) AS tickets_closed,
      AVG(EXTRACT(EPOCH FROM t.closed_at - t.created_at) / 3600.0) AS avg_resolution_hours
    FROM ticket_assignees ta
    JOIN tickets t ON t.id = ta.ticket_id
    WHERE t.status = 'closed' AND t.closed_at IS NOT NULL
      AND t.closed_at BETWEEN ${start}::timestamptz AND ${end}::timestamptz
      AND t.archived = false
      AND (${memberFilter}::int IS NULL OR ta.team_member_id = ${memberFilter})
    GROUP BY ta.team_member_id
  `;

  // Query 2: On-time completion
  const { rows: onTimeRows } = await sql`
    SELECT ta.team_member_id,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.closed_at::date <= t.due_date) AS on_time,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL) AS with_due_date
    FROM ticket_assignees ta
    JOIN tickets t ON t.id = ta.ticket_id
    WHERE t.status = 'closed' AND t.closed_at IS NOT NULL
      AND t.closed_at BETWEEN ${start}::timestamptz AND ${end}::timestamptz
      AND t.archived = false
      AND (${memberFilter}::int IS NULL OR ta.team_member_id = ${memberFilter})
    GROUP BY ta.team_member_id
  `;

  // Query 3: Currently overdue per member
  const { rows: overdueRows } = await sql`
    SELECT ta.team_member_id, COUNT(*) AS overdue_count
    FROM ticket_assignees ta
    JOIN tickets t ON t.id = ta.ticket_id
    WHERE t.status != 'closed'
      AND t.due_date < CURRENT_DATE
      AND t.archived = false
      AND (${memberFilter}::int IS NULL OR ta.team_member_id = ${memberFilter})
    GROUP BY ta.team_member_id
  `;

  // Query 4: Avg time open + count for current open tickets
  const { rows: openRows } = await sql`
    SELECT ta.team_member_id,
      AVG(EXTRACT(EPOCH FROM NOW() - t.created_at) / 3600.0) AS avg_open_hours,
      COUNT(*) AS open_tickets
    FROM ticket_assignees ta
    JOIN tickets t ON t.id = ta.ticket_id
    WHERE t.status != 'closed' AND t.archived = false
      AND (${memberFilter}::int IS NULL OR ta.team_member_id = ${memberFilter})
    GROUP BY ta.team_member_id
  `;

  // Query 5: Hours logged
  const { rows: hoursRows } = await sql`
    SELECT te.team_member_id,
      SUM(
        EXTRACT(EPOCH FROM
          LEAST(COALESCE(te.end_time, NOW()), ${end}::timestamptz)
          - GREATEST(te.start_time, ${start}::timestamptz)
        ) / 3600.0
      ) AS hours_logged
    FROM time_entries te
    WHERE te.start_time < ${end}::timestamptz
      AND COALESCE(te.end_time, NOW()) > ${start}::timestamptz
      AND (${memberFilter}::int IS NULL OR te.team_member_id = ${memberFilter})
    GROUP BY te.team_member_id
  `;

  // Get team members
  const { rows: memberRows } = await sql`
    SELECT id, name, color, profile_pic_url, available_hours_per_week FROM team_members
    WHERE active = true AND (${memberFilter}::int IS NULL OR id = ${memberFilter})
  `;

  // Build maps
  const closedMap = new Map(closedRows.map((r) => [r.team_member_id as number, r]));
  const onTimeMap = new Map(onTimeRows.map((r) => [r.team_member_id as number, r]));
  const overdueMap = new Map(overdueRows.map((r) => [r.team_member_id as number, r]));
  const openMap = new Map(openRows.map((r) => [r.team_member_id as number, r]));
  const hoursMap = new Map(hoursRows.map((r) => [r.team_member_id as number, r]));

  const members: PerformanceMember[] = memberRows.map((m) => {
    const id = m.id as number;
    const closed = closedMap.get(id);
    const onTime = onTimeMap.get(id);
    const overdue = overdueMap.get(id);
    const open = openMap.get(id);
    const hours = hoursMap.get(id);

    const ticketsClosed = closed ? (closed.tickets_closed as number) : 0;
    const avgResolutionHours = closed ? Math.round(parseFloat((closed.avg_resolution_hours as string) || "0") * 10) / 10 : 0;
    const hoursLogged = hours ? Math.round(parseFloat((hours.hours_logged as string) || "0") * 100) / 100 : 0;
    const overdueTickets = overdue ? (overdue.overdue_count as number) : 0;
    const openTickets = open ? (open.open_tickets as number) : 0;
    const avgOpenHours = open ? Math.round(parseFloat((open.avg_open_hours as string) || "0") * 10) / 10 : 0;
    const onTimeCount = onTime ? (onTime.on_time as number) : 0;
    const withDueDateCount = onTime ? (onTime.with_due_date as number) : 0;
    const onTimePct = withDueDateCount > 0 ? Math.round((onTimeCount / withDueDateCount) * 1000) / 10 : 0;

    return {
      teamMemberId: id,
      memberName: m.name as string,
      memberColor: (m.color as string) || "#6B7280",
      memberProfilePicUrl: (m.profile_pic_url as string) || "",
      availableHoursPerWeek: (m.available_hours_per_week as number) ?? 40,
      ticketsClosed,
      avgResolutionHours,
      hoursLogged,
      overdueTickets,
      openTickets,
      avgOpenHours,
      onTimeCount,
      withDueDateCount,
      onTimePct,
    };
  }).sort((a, b) => b.ticketsClosed - a.ticketsClosed);

  // Fetch open tickets for the filtered member(s), sorted by priority and overdue
  const memberIds = members.map((m) => m.teamMemberId);
  const memberIdsCsv = memberIds.join(",");
  let openTickets: PerformanceOpenTicket[] = [];

  if (memberIds.length > 0) {
    const { rows: openTicketRows } = await sql`
      SELECT DISTINCT t.id, t.ticket_number, t.title, t.status, t.priority, t.due_date,
        c.name AS client_name,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END AS priority_sort,
        CASE WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE THEN 0 ELSE 1 END AS overdue_sort
      FROM tickets t
      JOIN ticket_assignees ta ON ta.ticket_id = t.id
      LEFT JOIN clients c ON c.id = t.client_id
      WHERE ta.team_member_id = ANY(string_to_array(${memberIdsCsv}, ',')::int[])
        AND t.status NOT IN ('closed', 'approved_go_live')
        AND t.archived = false
        AND t.parent_ticket_id IS NULL
      ORDER BY priority_sort, overdue_sort, t.due_date ASC NULLS LAST
      LIMIT 50
    `;

    openTickets = openTicketRows.map((r) => ({
      id: r.id as number,
      ticketNumber: r.ticket_number as string,
      title: r.title as string,
      status: r.status as string,
      priority: r.priority as string,
      dueDate: r.due_date ? (r.due_date as Date).toISOString().split("T")[0] : null,
      clientName: (r.client_name as string) || null,
    }));
  }

  return { members, openTickets, period: { start, end } };
}

export async function getRevenueReport(months: number = 12): Promise<RevenueReport> {
  // Get all client packages with dates
  const { rows: pkgRows } = await sql`
    SELECT cp.id, cp.client_id, c.name AS client_name,
      cp.package_id, p.name AS package_name, p.category,
      COALESCE(cp.custom_price, p.default_price) AS price,
      cp.signup_date, cp.contract_end_date, cp.active
    FROM client_packages cp
    JOIN clients c ON c.id = cp.client_id
    JOIN packages p ON p.id = cp.package_id
    ORDER BY cp.signup_date ASC
  `;

  // Compute MRR per month
  const now = new Date();
  const mrrTrend: Array<{ month: string; mrr: number }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const trendMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = trendMonth.toISOString().slice(0, 7);
    const monthEndDate = new Date(trendMonth);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);

    let monthMrr = 0;
    for (const pkg of pkgRows) {
      const signupDate = pkg.signup_date ? new Date(pkg.signup_date as string) : null;
      const endDate = pkg.contract_end_date ? new Date(pkg.contract_end_date as string) : null;
      const price = parseFloat((pkg.price as string) || "0");

      // Package was active during this month if:
      // - signup_date <= end of month
      // - (no end_date OR end_date >= start of month)
      // - (still active OR had an end_date in the future at that time)
      const wasActive = signupDate && signupDate < monthEndDate
        && (!endDate || endDate >= trendMonth);

      if (wasActive && price > 0) {
        monthMrr += price;
      }
    }
    mrrTrend.push({ month: monthStr, mrr: Math.round(monthMrr * 100) / 100 });
  }

  const currentMrr = mrrTrend.length > 0 ? mrrTrend[mrrTrend.length - 1].mrr : 0;

  // Revenue by category (current active)
  const { rows: catRows } = await sql`
    SELECT p.category,
      SUM(COALESCE(cp.custom_price, p.default_price)) AS revenue
    FROM client_packages cp
    JOIN packages p ON p.id = cp.package_id
    WHERE cp.active = true
    GROUP BY p.category
    ORDER BY revenue DESC
  `;

  const revenueByCategory = catRows.map((r) => ({
    category: (r.category as string) || "other",
    revenue: Math.round(parseFloat((r.revenue as string) || "0") * 100) / 100,
  }));

  // Client lifetime value
  const { rows: ltvRows } = await sql`
    SELECT c.id, c.name, c.mrr, c.contract_start_date, c.created_at
    FROM clients c
    WHERE c.active = true AND c.mrr > 0
    ORDER BY c.mrr DESC
  `;

  const clientLtv = ltvRows.map((r) => {
    const mrr = parseFloat((r.mrr as string) || "0");
    const startDate = r.contract_start_date ? new Date(r.contract_start_date as string) : new Date(r.created_at as string);
    const monthsActive = Math.max(1, Math.round((now.getTime() - startDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    return {
      clientId: r.id as number,
      clientName: r.name as string,
      mrr,
      monthsActive,
      ltv: Math.round(mrr * monthsActive * 100) / 100,
    };
  }).sort((a, b) => b.ltv - a.ltv);

  return {
    currentMrr,
    mrrTrend,
    revenueByCategory,
    clientLtv,
    projectedAnnualRevenue: Math.round(currentMrr * 12 * 100) / 100,
  };
}

export async function getForecastingReport(): Promise<ForecastingReport> {
  // Upcoming deadlines (next 28 days)
  const { rows: deadlineRows } = await sql`
    SELECT t.id, t.ticket_number, t.title, t.due_date, t.status, t.priority,
      c.name AS client_name
    FROM tickets t
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.status != 'closed' AND t.archived = false
      AND t.due_date IS NOT NULL
      AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '28 days'
    ORDER BY t.due_date ASC
  `;

  // Get assignees for these tickets
  const ticketIds = deadlineRows.map((r) => r.id as number);
  let assigneeMap = new Map<number, string[]>();

  if (ticketIds.length > 0) {
    const ticketIdsStr = `{${ticketIds.join(",")}}`;
    const { rows: assigneeRows } = await sql`
      SELECT ta.ticket_id, tm.name
      FROM ticket_assignees ta
      JOIN team_members tm ON tm.id = ta.team_member_id
      WHERE ta.ticket_id = ANY(${ticketIdsStr}::int[])
    `;
    for (const r of assigneeRows) {
      const tid = r.ticket_id as number;
      if (!assigneeMap.has(tid)) assigneeMap.set(tid, []);
      assigneeMap.get(tid)!.push(r.name as string);
    }
  }

  const upcomingDeadlines: ForecastDeadline[] = deadlineRows.map((r) => ({
    ticketId: r.id as number,
    ticketNumber: r.ticket_number as string,
    title: r.title as string,
    dueDate: (r.due_date as Date).toISOString().slice(0, 10),
    status: r.status as string,
    priority: r.priority as string,
    clientName: (r.client_name as string) ?? null,
    assigneeNames: assigneeMap.get(r.id as number) || [],
  }));

  // Current workload per member
  const { rows: workloadRows } = await sql`
    SELECT tm.id AS team_member_id, tm.name AS member_name, tm.color AS member_color,
      tm.available_hours_per_week,
      COUNT(DISTINCT t.id) AS open_tickets,
      COUNT(DISTINCT t.id) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE) AS overdue_tickets
    FROM team_members tm
    LEFT JOIN ticket_assignees ta ON ta.team_member_id = tm.id
    LEFT JOIN tickets t ON t.id = ta.ticket_id AND t.status != 'closed' AND t.archived = false
    WHERE tm.active = true
    GROUP BY tm.id, tm.name, tm.color, tm.available_hours_per_week
    ORDER BY open_tickets DESC
  `;

  // Hours logged this week per member
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const { rows: weekHoursRows } = await sql`
    SELECT te.team_member_id,
      SUM(
        EXTRACT(EPOCH FROM
          LEAST(COALESCE(te.end_time, NOW()), NOW())
          - GREATEST(te.start_time, ${weekStart.toISOString()}::timestamptz)
        ) / 3600.0
      ) AS hours
    FROM time_entries te
    WHERE te.start_time < NOW()
      AND COALESCE(te.end_time, NOW()) > ${weekStart.toISOString()}::timestamptz
    GROUP BY te.team_member_id
  `;

  const weekHoursMap = new Map<number, number>();
  for (const r of weekHoursRows) {
    weekHoursMap.set(r.team_member_id as number, parseFloat((r.hours as string) || "0"));
  }

  const teamWorkload: ForecastWorkload[] = workloadRows.map((r) => {
    const id = r.team_member_id as number;
    const availableHours = parseFloat((r.available_hours_per_week as string) || "40");
    const hoursLoggedThisWeek = Math.round((weekHoursMap.get(id) || 0) * 100) / 100;
    const remainingCapacity = Math.round((availableHours - hoursLoggedThisWeek) * 100) / 100;
    const utilizationPct = availableHours > 0 ? (hoursLoggedThisWeek / availableHours) * 100 : 0;

    let capacityStatus: "overloaded" | "balanced" | "available" = "available";
    if (utilizationPct >= 100) capacityStatus = "overloaded";
    else if (utilizationPct >= 60) capacityStatus = "balanced";

    return {
      teamMemberId: id,
      memberName: r.member_name as string,
      memberColor: (r.member_color as string) || "#6B7280",
      openTickets: (r.open_tickets as number) || 0,
      overdueTickets: (r.overdue_tickets as number) || 0,
      hoursLoggedThisWeek,
      availableHours,
      remainingCapacity,
      capacityStatus,
    };
  });

  // Deadline heatmap (count of deadlines per day, next 28 days)
  const deadlineHeatmap: Array<{ date: string; count: number }> = [];
  const heatmapMap = new Map<string, number>();
  for (const d of upcomingDeadlines) {
    heatmapMap.set(d.dueDate, (heatmapMap.get(d.dueDate) || 0) + 1);
  }
  for (let i = 0; i < 28; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    deadlineHeatmap.push({ date: dateStr, count: heatmapMap.get(dateStr) || 0 });
  }

  return { upcomingDeadlines, teamWorkload, deadlineHeatmap };
}
