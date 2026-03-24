import { sql } from "@vercel/postgres";
import { TimeEntry, RunningTimer, ClientHoursSummary, TeamTimeReportEntry, ServiceHoursSummary, ServiceBoardCategory } from "@/types";

// === Row Mappers ===

function rowToTimeEntry(row: Record<string, unknown>): TimeEntry {
  return {
    id: row.id as number,
    ticketId: row.ticket_id as number,
    teamMemberId: row.team_member_id as number,
    startTime: (row.start_time as Date)?.toISOString(),
    endTime: row.end_time ? (row.end_time as Date)?.toISOString() : null,
    durationSeconds: (row.duration_seconds as number) ?? null,
    isManual: (row.is_manual as boolean) ?? false,
    note: (row.note as string) || "",
    createdAt: (row.created_at as Date)?.toISOString(),
    // Joined fields
    memberName: (row.member_name as string) || undefined,
    memberColor: (row.member_color as string) || undefined,
    memberProfilePicUrl: (row.member_profile_pic_url as string) || undefined,
    ticketNumber: (row.ticket_number as string) || undefined,
    ticketTitle: (row.ticket_title as string) || undefined,
    clientId: (row.client_id as number) ?? null,
    clientName: (row.client_name as string) ?? null,
  };
}

// === Timer Operations ===

export async function startTimer(
  ticketId: number,
  teamMemberId: number
): Promise<TimeEntry> {
  // Stop ALL running timers for this team member (handles zombies too)
  await sql`
    UPDATE time_entries SET
      end_time = NOW(),
      duration_seconds = EXTRACT(EPOCH FROM NOW() - start_time)::INTEGER
    WHERE team_member_id = ${teamMemberId} AND end_time IS NULL
  `;

  const { rows } = await sql`
    INSERT INTO time_entries (ticket_id, team_member_id, start_time)
    VALUES (${ticketId}, ${teamMemberId}, NOW())
    RETURNING *
  `;
  return rowToTimeEntry(rows[0]);
}

export async function stopTimer(entryId: number): Promise<TimeEntry | null> {
  const { rows } = await sql`
    UPDATE time_entries SET
      end_time = NOW(),
      duration_seconds = EXTRACT(EPOCH FROM NOW() - start_time)::INTEGER
    WHERE id = ${entryId} AND end_time IS NULL
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToTimeEntry(rows[0]);
}

export async function stopTimerByMember(teamMemberId: number): Promise<TimeEntry | null> {
  const { rows } = await sql`
    UPDATE time_entries SET
      end_time = NOW(),
      duration_seconds = EXTRACT(EPOCH FROM NOW() - start_time)::INTEGER
    WHERE team_member_id = ${teamMemberId} AND end_time IS NULL
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToTimeEntry(rows[0]);
}

export async function getRunningTimer(teamMemberId: number): Promise<RunningTimer | null> {
  const { rows } = await sql`
    SELECT te.id AS entry_id, te.ticket_id, te.start_time,
      t.ticket_number, t.title AS ticket_title,
      c.name AS client_name
    FROM time_entries te
    JOIN tickets t ON t.id = te.ticket_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE te.team_member_id = ${teamMemberId} AND te.end_time IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return {
    entryId: rows[0].entry_id as number,
    ticketId: rows[0].ticket_id as number,
    ticketNumber: rows[0].ticket_number as string,
    ticketTitle: rows[0].ticket_title as string,
    startTime: (rows[0].start_time as Date)?.toISOString(),
    clientName: (rows[0].client_name as string) ?? null,
  };
}

// === Manual Entry ===

export async function addManualEntry(data: {
  ticketId: number;
  teamMemberId: number;
  startTime: string;
  endTime: string;
  note?: string;
}): Promise<TimeEntry> {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  const durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);

  const { rows } = await sql`
    INSERT INTO time_entries (ticket_id, team_member_id, start_time, end_time, duration_seconds, is_manual, note)
    VALUES (
      ${data.ticketId},
      ${data.teamMemberId},
      ${data.startTime},
      ${data.endTime},
      ${durationSeconds},
      true,
      ${data.note || ""}
    )
    RETURNING *
  `;
  return rowToTimeEntry(rows[0]);
}

// === CRUD ===

export async function editTimeEntry(
  entryId: number,
  data: { startTime?: string; endTime?: string; note?: string }
): Promise<TimeEntry | null> {
  const existing = await sql`SELECT * FROM time_entries WHERE id = ${entryId}`;
  if (existing.rows.length === 0) return null;

  const current = existing.rows[0];
  const startTime = data.startTime ?? (current.start_time as Date).toISOString();
  const endTime = data.endTime ?? (current.end_time ? (current.end_time as Date).toISOString() : null);
  const note = data.note ?? (current.note as string);

  let durationSeconds: number | null = null;
  if (endTime) {
    durationSeconds = Math.round(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
    );
  }

  const { rows } = await sql`
    UPDATE time_entries SET
      start_time = ${startTime},
      end_time = ${endTime},
      duration_seconds = ${durationSeconds},
      note = ${note}
    WHERE id = ${entryId}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToTimeEntry(rows[0]);
}

export async function deleteTimeEntry(entryId: number): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM time_entries WHERE id = ${entryId}`;
  return (rowCount ?? 0) > 0;
}

// === Queries ===

export async function getTimeEntriesForTicket(ticketId: number): Promise<TimeEntry[]> {
  const { rows } = await sql`
    SELECT te.*, tm.name AS member_name, tm.color AS member_color,
      tm.profile_pic_url AS member_profile_pic_url
    FROM time_entries te
    JOIN team_members tm ON tm.id = te.team_member_id
    WHERE te.ticket_id = ${ticketId}
    ORDER BY te.start_time DESC
  `;
  return rows.map(rowToTimeEntry);
}

export async function getTotalSecondsForTicket(ticketId: number): Promise<number> {
  const { rows } = await sql`
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM end_time - start_time)::INTEGER
    ), 0) AS total
    FROM time_entries
    WHERE ticket_id = ${ticketId} AND end_time IS NOT NULL
  `;
  return rows[0].total as number;
}

// === Monthly Hours (with month-boundary clamping) ===

export async function getMonthlyHoursForClient(
  clientId: number,
  month: string // ISO date string for first day of month, e.g. "2026-03-01"
): Promise<{ totalHours: number; byTicket: Array<{ ticketId: number; ticketNumber: string; ticketTitle: string; hours: number }> }> {
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const { rows } = await sql`
    SELECT t.id AS ticket_id, t.ticket_number, t.title AS ticket_title,
      SUM(
        EXTRACT(EPOCH FROM
          LEAST(COALESCE(te.end_time, NOW()), ${monthEnd.toISOString()}::timestamptz)
          - GREATEST(te.start_time, ${monthStart.toISOString()}::timestamptz)
        ) / 3600.0
      ) AS hours
    FROM time_entries te
    JOIN tickets t ON t.id = te.ticket_id
    WHERE t.client_id = ${clientId}
      AND te.start_time < ${monthEnd.toISOString()}::timestamptz
      AND COALESCE(te.end_time, NOW()) > ${monthStart.toISOString()}::timestamptz
    GROUP BY t.id, t.ticket_number, t.title
    ORDER BY hours DESC
  `;

  const byTicket = rows.map((r) => ({
    ticketId: r.ticket_id as number,
    ticketNumber: r.ticket_number as string,
    ticketTitle: r.ticket_title as string,
    hours: parseFloat((r.hours as string) || "0"),
  }));

  const totalHours = byTicket.reduce((sum, t) => sum + t.hours, 0);
  return { totalHours, byTicket };
}

export async function getMonthlyHoursForMember(
  teamMemberId: number,
  month: string
): Promise<number> {
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const { rows } = await sql`
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM
        LEAST(COALESCE(te.end_time, NOW()), ${monthEnd.toISOString()}::timestamptz)
        - GREATEST(te.start_time, ${monthStart.toISOString()}::timestamptz)
      ) / 3600.0
    ), 0) AS hours
    FROM time_entries te
    WHERE te.team_member_id = ${teamMemberId}
      AND te.start_time < ${monthEnd.toISOString()}::timestamptz
      AND COALESCE(te.end_time, NOW()) > ${monthStart.toISOString()}::timestamptz
  `;
  return parseFloat((rows[0].hours as string) || "0");
}

// === Client Hour Cap ===

export async function getClientHourCap(
  clientId: number,
  month: string
): Promise<ClientHoursSummary> {
  // Get included hours from active packages
  const { rows: pkgRows } = await sql`
    SELECT COALESCE(SUM(COALESCE(cp.custom_hours, p.hours_included, 0)), 0) AS total_hours,
      c.name AS client_name
    FROM client_packages cp
    JOIN packages p ON p.id = cp.package_id
    JOIN clients c ON c.id = ${clientId}
    WHERE cp.client_id = ${clientId} AND cp.active = true
    GROUP BY c.name
  `;

  const includedHours = pkgRows.length > 0 ? parseFloat((pkgRows[0].total_hours as string) || "0") : 0;
  const clientName = pkgRows.length > 0 ? (pkgRows[0].client_name as string) : "";

  // Get logged hours
  const { totalHours, byTicket } = await getMonthlyHoursForClient(clientId, month);

  const percentUsed = includedHours > 0 ? (totalHours / includedHours) * 100 : 0;
  let status: "ok" | "warning" | "exceeded" = "ok";
  if (percentUsed >= 100) status = "exceeded";
  else if (percentUsed >= 80) status = "warning";

  return {
    clientId,
    clientName,
    month,
    loggedHours: Math.round(totalHours * 100) / 100,
    includedHours,
    percentUsed: Math.round(percentUsed * 10) / 10,
    status,
    byTicket,
  };
}

// === Service Board Hour Aggregation (per category) ===

export async function getServiceHoursForClient(
  clientId: number,
  category: ServiceBoardCategory,
  month: string
): Promise<{ totalHours: number; byTicket: Array<{ ticketId: number; ticketNumber: string; ticketTitle: string; hours: number }> }> {
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const { rows } = await sql`
    SELECT t.id AS ticket_id, t.ticket_number, t.title AS ticket_title,
      SUM(
        EXTRACT(EPOCH FROM
          LEAST(COALESCE(te.end_time, NOW()), ${monthEnd.toISOString()}::timestamptz)
          - GREATEST(te.start_time, ${monthStart.toISOString()}::timestamptz)
        ) / 3600.0
      ) AS hours
    FROM time_entries te
    JOIN tickets t ON t.id = te.ticket_id
    WHERE t.client_id = ${clientId}
      AND t.service_category = ${category}
      AND te.start_time < ${monthEnd.toISOString()}::timestamptz
      AND COALESCE(te.end_time, NOW()) > ${monthStart.toISOString()}::timestamptz
    GROUP BY t.id, t.ticket_number, t.title
    ORDER BY hours DESC
  `;

  const byTicket = rows.map((r) => ({
    ticketId: r.ticket_id as number,
    ticketNumber: r.ticket_number as string,
    ticketTitle: r.ticket_title as string,
    hours: parseFloat((r.hours as string) || "0"),
  }));

  const totalHours = byTicket.reduce((sum, t) => sum + t.hours, 0);
  return { totalHours, byTicket };
}

export async function getServiceHourCap(
  clientId: number,
  category: ServiceBoardCategory,
  clientPackageId: number,
  month: string
): Promise<ServiceHoursSummary> {
  // Get included hours from the specific package assignment
  const { rows: pkgRows } = await sql`
    SELECT COALESCE(cp.custom_hours, p.hours_included, 0) AS included_hours
    FROM client_packages cp
    JOIN packages p ON p.id = cp.package_id
    WHERE cp.id = ${clientPackageId}
  `;

  const includedHours = pkgRows.length > 0 ? parseFloat((pkgRows[0].included_hours as string) || "0") : 0;

  const { totalHours, byTicket } = await getServiceHoursForClient(clientId, category, month);

  const percentUsed = includedHours > 0 ? (totalHours / includedHours) * 100 : 0;
  let status: "ok" | "warning" | "exceeded" = "ok";
  if (percentUsed >= 100) status = "exceeded";
  else if (percentUsed >= 80) status = "warning";

  return {
    clientId,
    category,
    month,
    loggedHours: Math.round(totalHours * 100) / 100,
    includedHours,
    percentUsed: Math.round(percentUsed * 10) / 10,
    status,
    byTicket,
  };
}

// === Team Report ===

export async function getTeamTimeReport(
  period: "week" | "month"
): Promise<TeamTimeReportEntry[]> {
  const now = new Date();
  let periodStart: Date;

  if (period === "week") {
    periodStart = new Date(now);
    periodStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    periodStart.setHours(0, 0, 0, 0);
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const { rows } = await sql`
    SELECT te.team_member_id, tm.name AS member_name, tm.color AS member_color,
      t.client_id, c.name AS client_name,
      SUM(
        EXTRACT(EPOCH FROM
          LEAST(COALESCE(te.end_time, NOW()), NOW())
          - GREATEST(te.start_time, ${periodStart.toISOString()}::timestamptz)
        )
      )::INTEGER AS seconds
    FROM time_entries te
    JOIN team_members tm ON tm.id = te.team_member_id
    JOIN tickets t ON t.id = te.ticket_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE te.start_time < NOW()
      AND COALESCE(te.end_time, NOW()) > ${periodStart.toISOString()}::timestamptz
    GROUP BY te.team_member_id, tm.name, tm.color, t.client_id, c.name
    ORDER BY tm.name, c.name
  `;

  // Group by team member
  const memberMap = new Map<number, TeamTimeReportEntry>();
  for (const row of rows) {
    const memberId = row.team_member_id as number;
    if (!memberMap.has(memberId)) {
      memberMap.set(memberId, {
        teamMemberId: memberId,
        memberName: row.member_name as string,
        memberColor: row.member_color as string,
        totalSeconds: 0,
        byClient: [],
      });
    }
    const entry = memberMap.get(memberId)!;
    const seconds = row.seconds as number;
    entry.totalSeconds += seconds;
    entry.byClient.push({
      clientId: (row.client_id as number) ?? null,
      clientName: (row.client_name as string) ?? null,
      seconds,
    });
  }

  return Array.from(memberMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
}

// === Runaway Timer Detection ===

export async function checkRunawayTimers(): Promise<TimeEntry[]> {
  const { rows } = await sql`
    SELECT te.*, tm.name AS member_name, tm.color AS member_color,
      t.ticket_number, t.title AS ticket_title
    FROM time_entries te
    JOIN team_members tm ON tm.id = te.team_member_id
    JOIN tickets t ON t.id = te.ticket_id
    WHERE te.end_time IS NULL
      AND te.start_time < NOW() - INTERVAL '10 hours'
  `;
  return rows.map(rowToTimeEntry);
}
