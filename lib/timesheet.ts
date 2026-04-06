import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import type {
  TimesheetEntry,
  TimesheetBreak,
  VacationRequest,
  TimesheetChangeRequest,
  PayrollReportEntry,
  TimesheetIssueType,
} from "@/types";

// === Doc Mappers ===

export function docToTimesheetEntry(doc: any): TimesheetEntry {
  return {
    id: doc._id,
    teamMemberId: doc.teamMemberId,
    date: doc.date,
    clockInTime: doc.clockInTime ?? "",
    clockOutTime: doc.clockOutTime ?? null,
    totalBreakMinutes: doc.totalBreakMinutes ?? 0,
    workedMinutes: doc.workedMinutes ?? null,
    isSickDay: doc.isSickDay ?? false,
    isHalfSickDay: doc.isHalfSickDay ?? false,
    isVacation: doc.isVacation ?? false,
    note: doc.note ?? "",
    issues: (doc.issues as TimesheetIssueType[]) ?? [],
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

export function docToTimesheetBreak(doc: any): TimesheetBreak {
  return {
    id: doc._id,
    timesheetEntryId: doc.timesheetEntryId,
    startTime: doc.startTime ?? "",
    endTime: doc.endTime ?? null,
    breakType: doc.breakType ?? "unpaid",
    durationMinutes: doc.durationMinutes ?? null,
  };
}

export function docToVacationRequest(doc: any): VacationRequest {
  return {
    id: doc._id,
    teamMemberId: doc.teamMemberId,
    startDate: doc.startDate,
    endDate: doc.endDate,
    totalDays: doc.totalDays,
    reason: doc.reason ?? "",
    status: doc.status,
    reviewedById: doc.reviewedById ?? null,
    reviewedAt: doc.reviewedAt ?? null,
    reviewNote: doc.reviewNote ?? null,
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

export function docToChangeRequest(doc: any): TimesheetChangeRequest {
  return {
    id: doc._id,
    timesheetEntryId: doc.timesheetEntryId,
    teamMemberId: doc.teamMemberId,
    originalClockIn: doc.originalClockIn,
    originalClockOut: doc.originalClockOut ?? null,
    proposedClockIn: doc.proposedClockIn,
    proposedClockOut: doc.proposedClockOut ?? null,
    reason: doc.reason,
    status: doc.status,
    reviewedById: doc.reviewedById ?? null,
    reviewedAt: doc.reviewedAt ?? null,
    reviewNote: doc.reviewNote ?? null,
    minutesDelta: doc.minutesDelta ?? null,
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

// === Clock In/Out Operations ===

export async function clockIn(
  teamMemberId: string
): Promise<TimesheetEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetEntries.clockIn, {
    teamMemberId: teamMemberId as any,
  });
  return doc ? docToTimesheetEntry(doc) : null;
}

export async function clockOut(
  entryId: string
): Promise<TimesheetEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetEntries.clockOut, {
    id: entryId as any,
  });
  return doc ? docToTimesheetEntry(doc) : null;
}

export async function getActiveShift(
  teamMemberId: string
): Promise<TimesheetEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.timesheetEntries.getActiveShift, {
    teamMemberId: teamMemberId as any,
  });
  return doc ? docToTimesheetEntry(doc) : null;
}

// === Break Operations ===

export async function startBreak(
  timesheetEntryId: string
): Promise<TimesheetBreak | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetBreaks.startBreak, {
    timesheetEntryId: timesheetEntryId as any,
  });
  return doc ? docToTimesheetBreak(doc) : null;
}

export async function endBreak(
  breakId: string
): Promise<TimesheetBreak | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetBreaks.endBreak, {
    id: breakId as any,
  });
  return doc ? docToTimesheetBreak(doc) : null;
}

export async function getActiveBreak(
  timesheetEntryId: string
): Promise<TimesheetBreak | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.timesheetBreaks.getActiveBreak, {
    timesheetEntryId: timesheetEntryId as any,
  });
  return doc ? docToTimesheetBreak(doc) : null;
}

export async function getBreaksForEntry(
  timesheetEntryId: string
): Promise<TimesheetBreak[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.timesheetBreaks.listByEntry, {
    timesheetEntryId: timesheetEntryId as any,
  });
  return docs.map(docToTimesheetBreak);
}

// === Sick Day ===

export async function markSickDay(
  teamMemberId: string,
  date: string,
  isHalf: boolean = false
): Promise<TimesheetEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetEntries.markSickDay, {
    teamMemberId: teamMemberId as any,
    date,
    isHalf,
  });
  return doc ? docToTimesheetEntry(doc) : null;
}

// === History / Queries ===

export async function getTimesheetHistory(
  teamMemberId: string,
  startDate?: string,
  endDate?: string
): Promise<TimesheetEntry[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.timesheetEntries.listByMember, {
    teamMemberId: teamMemberId as any,
    startDate,
    endDate,
  });
  return docs.map(docToTimesheetEntry);
}

export async function getAllTimesheetEntries(
  startDate: string,
  endDate: string
): Promise<TimesheetEntry[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.timesheetEntries.listByDateRange, {
    startDate,
    endDate,
  });
  return docs.map(docToTimesheetEntry);
}

// === Vacation Requests ===

export async function createVacationRequest(
  teamMemberId: string,
  startDate: string,
  endDate: string,
  totalDays: number,
  reason?: string
): Promise<VacationRequest | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.vacationRequests.create, {
    teamMemberId: teamMemberId as any,
    startDate,
    endDate,
    totalDays,
    reason,
  });
  return doc ? docToVacationRequest(doc) : null;
}

export async function getMyVacationRequests(
  teamMemberId: string
): Promise<VacationRequest[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.vacationRequests.listByMember, {
    teamMemberId: teamMemberId as any,
  });
  return docs.map(docToVacationRequest);
}

export async function getPendingVacationRequests(): Promise<VacationRequest[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.vacationRequests.listPending, {});
  return docs.map(docToVacationRequest);
}

export async function approveVacationRequest(
  requestId: string,
  reviewedById: string,
  reviewNote?: string
): Promise<VacationRequest | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.vacationRequests.approve, {
    id: requestId as any,
    reviewedById: reviewedById as any,
    reviewNote,
  });
  return doc ? docToVacationRequest(doc) : null;
}

export async function denyVacationRequest(
  requestId: string,
  reviewedById: string,
  reviewNote?: string
): Promise<VacationRequest | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.vacationRequests.deny, {
    id: requestId as any,
    reviewedById: reviewedById as any,
    reviewNote,
  });
  return doc ? docToVacationRequest(doc) : null;
}

// === Change Requests ===

export async function createChangeRequest(
  timesheetEntryId: string,
  teamMemberId: string,
  proposedClockIn: string,
  proposedClockOut: string | undefined,
  reason: string
): Promise<TimesheetChangeRequest | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetChangeRequests.create, {
    timesheetEntryId: timesheetEntryId as any,
    teamMemberId: teamMemberId as any,
    proposedClockIn,
    proposedClockOut,
    reason,
  });
  return doc ? docToChangeRequest(doc) : null;
}

export async function getPendingChangeRequests(): Promise<
  TimesheetChangeRequest[]
> {
  const convex = getConvexClient();
  const docs = await convex.query(api.timesheetChangeRequests.listPending, {});
  return docs.map(docToChangeRequest);
}

export async function approveChangeRequest(
  requestId: string,
  reviewedById: string,
  reviewNote?: string
): Promise<TimesheetChangeRequest | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetChangeRequests.approve, {
    id: requestId as any,
    reviewedById: reviewedById as any,
    reviewNote,
  });
  return doc ? docToChangeRequest(doc) : null;
}

export async function denyChangeRequest(
  requestId: string,
  reviewedById: string,
  reviewNote?: string
): Promise<TimesheetChangeRequest | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetChangeRequests.deny, {
    id: requestId as any,
    reviewedById: reviewedById as any,
    reviewNote,
  });
  return doc ? docToChangeRequest(doc) : null;
}

// === Admin Edit ===

export async function adminEditEntry(
  entryId: string,
  updates: {
    clockInTime?: string;
    clockOutTime?: string;
    note?: string;
    isSickDay?: boolean;
    isHalfSickDay?: boolean;
    isVacation?: boolean;
  }
): Promise<TimesheetEntry | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.timesheetEntries.adminEdit, {
    id: entryId as any,
    ...updates,
  });
  return doc ? docToTimesheetEntry(doc) : null;
}

// === Payroll Report ===

export async function generatePayrollReport(
  startDate: string,
  endDate: string
): Promise<PayrollReportEntry[]> {
  const convex = getConvexClient();

  // Fetch all entries for date range
  const entries = await convex.query(api.timesheetEntries.listByDateRange, {
    startDate,
    endDate,
  });

  // Fetch all team members
  const members = await convex.query(api.teamMembers.list, {
    activeOnly: false,
  });

  const memberMap = new Map(members.map((m: any) => [m._id, m]));

  // Group entries by team member
  const byMember = new Map<string, any[]>();
  for (const entry of entries) {
    const existing = byMember.get(entry.teamMemberId) ?? [];
    existing.push(entry);
    byMember.set(entry.teamMemberId, existing);
  }

  const report: PayrollReportEntry[] = [];
  for (const [memberId, memberEntries] of byMember) {
    const member = memberMap.get(memberId);
    if (!member) continue;

    let totalWorkedMinutes = 0;
    let sickDays = 0;
    let halfSickDays = 0;
    let vacationDays = 0;
    let overtimeDays = 0;
    let issueCount = 0;

    for (const entry of memberEntries) {
      totalWorkedMinutes += entry.workedMinutes ?? 0;
      if (entry.isSickDay) sickDays++;
      if (entry.isHalfSickDay) halfSickDays++;
      if (entry.isVacation) vacationDays++;
      if (entry.workedMinutes && entry.workedMinutes > 480) overtimeDays++;
      if (entry.issues?.length) issueCount += entry.issues.length;
    }

    report.push({
      teamMemberId: memberId,
      memberName: member.name,
      payType: (member.payType as "hourly" | "salary") ?? "hourly",
      hourlyRate: member.hourlyRate ?? null,
      totalWorkedMinutes,
      totalWorkedDecimalHours:
        Math.round((totalWorkedMinutes / 60) * 100) / 100,
      sickDays,
      halfSickDays,
      vacationDays,
      overtimeDays,
      issueCount,
    });
  }

  // Sort by name
  report.sort((a, b) => a.memberName.localeCompare(b.memberName));
  return report;
}

// === CSV Export ===

export function payrollReportToCsv(report: PayrollReportEntry[]): string {
  const headers = [
    "Employee",
    "Pay Type",
    "Hourly Rate",
    "Total Hours",
    "Decimal Hours",
    "Sick Days",
    "Half-Sick Days",
    "Vacation Days",
    "Overtime Days",
    "Issues",
  ];

  const rows = report.map((r) => [
    r.memberName,
    r.payType,
    r.hourlyRate ?? "",
    formatMinutesAsHM(r.totalWorkedMinutes),
    r.totalWorkedDecimalHours,
    r.sickDays,
    r.halfSickDays,
    r.vacationDays,
    r.overtimeDays,
    r.issueCount,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// === Settings ===

export async function getTimesheetSettings() {
  const convex = getConvexClient();
  return await convex.query(api.timesheetSettings.get, {});
}

export async function updateTimesheetSettings(updates: {
  halfDaySickCutoffTime?: string;
  overtimeThresholdMinutes?: number;
  longShiftBreakThresholdMinutes?: number;
  defaultVacationDaysPerYear?: number;
}) {
  const convex = getConvexClient();
  return await convex.mutation(api.timesheetSettings.update, updates);
}

// === Helpers ===

export function formatMinutesAsHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
