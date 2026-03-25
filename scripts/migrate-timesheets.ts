/**
 * Data migration script: Ollie Timesheets (Supabase) → Convex
 *
 * Usage:
 *   npx tsx scripts/migrate-timesheets.ts
 *
 * Pulls data DIRECTLY from Ollie Supabase and pushes to Convex.
 * Step 1: Clears existing timesheet data (entries + breaks)
 * Step 2: Updates team member wages from Ollie employees
 * Step 3: Migrates all time_entries with correct column names
 * Step 4: Migrates all breaks
 * Step 5: Migrates settings from Ollie settings table → Convex timesheetSettings
 *
 * Ollie columns:
 *   time_entries: clock_in, clock_out, is_vacation_day, admin_notes, is_half_sick_day, pending_approval, change_request
 *   breaks: time_entry_id, start_time, end_time, break_type
 *   employees: hourly_rate, vacation_days_total, role
 *   settings: key, value (owner-level settings)
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
}

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://lbwgretbgatmhvqspnyp.supabase.co";
const SUPABASE_KEY = process.env.OLLIE_SUPABASE_SERVICE_KEY;
if (!SUPABASE_KEY) {
  console.error("Missing OLLIE_SUPABASE_SERVICE_KEY in .env.local");
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CHOQUER_OWNER_ID = "9a518987-a4c5-43bf-ab75-557f05c9fca1";

async function fetchAll(table: string, filters?: { column: string; value: string }[]) {
  let query = supabase.from(table).select("*");
  if (filters) {
    for (const f of filters) {
      query = query.eq(f.column, f.value);
    }
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch ${table}: ${error.message}`);
  }
  return data ?? [];
}

async function main() {
  console.log("=== Ollie → Convex Migration (from Supabase) ===\n");

  // Pull data from Ollie Supabase
  console.log("Fetching data from Ollie Supabase...");
  const [employees, timeEntries, breaks, settings] = await Promise.all([
    fetchAll("employees", [{ column: "owner_id", value: CHOQUER_OWNER_ID }]),
    fetchAll("time_entries", [{ column: "owner_id", value: CHOQUER_OWNER_ID }]),
    fetchAll("breaks"),
    fetchAll("settings", [{ column: "owner_id", value: CHOQUER_OWNER_ID }]),
  ]);

  console.log(`Fetched: ${employees.length} employees, ${timeEntries.length} time entries, ${breaks.length} breaks, ${settings.length} settings`);

  // Filter OUT test data (emily@penni.ca)
  const filteredEmployees = employees.filter(
    (e: any) => e.email?.toLowerCase() !== "emily@penni.ca"
  );

  // Filter OUT inactive employees with no email
  const activeEmployees = filteredEmployees.filter(
    (e: any) => e.email || e.is_active
  );

  console.log(`Choquer employees: ${employees.length} total, ${activeEmployees.length} after filtering\n`);

  // ── Step 1: Clear existing timesheet data ──
  console.log("Step 1: Clearing existing timesheet data from Convex...");
  let cleared = 0;
  while (true) {
    const count = await convex.mutation(api.timesheetEntries.removeBatch, { limit: 50 });
    cleared += count;
    if (count === 0) break;
    if (cleared % 100 === 0) console.log(`  ... cleared ${cleared} entries`);
  }
  console.log(`  Cleared ${cleared} entries (and their breaks)\n`);

  // ── Step 2: Map Ollie employees → Convex team members & update wages ──
  console.log("Step 2: Syncing wages from Ollie to Convex team members...");
  const teamMembers = await convex.query(api.teamMembers.list, { activeOnly: false });
  const emailToMember = new Map<string, any>();
  for (const m of teamMembers as any[]) {
    emailToMember.set(m.email.toLowerCase(), m);
  }

  // Map ollie employee_id → convex teamMemberId
  const ollieIdToConvexId = new Map<string, string>();

  for (const emp of activeEmployees) {
    if (!emp.email) continue;
    const member = emailToMember.get(emp.email.toLowerCase());
    if (!member) {
      console.log(`  ✗ ${emp.name} (${emp.email}) — no matching team member in Convex`);
      continue;
    }

    ollieIdToConvexId.set(emp.id, member._id);

    // Update wages
    const updates: Record<string, any> = {};
    const rate = emp.hourly_rate ? parseFloat(emp.hourly_rate) : null;
    const vacDays = emp.vacation_days_total ? parseInt(emp.vacation_days_total) : null;

    if (rate !== null && rate !== member.hourlyRate) {
      updates.hourlyRate = rate;
      updates.payType = "hourly";
    }
    if (vacDays !== null && vacDays !== member.vacationDaysTotal) {
      updates.vacationDaysTotal = vacDays;
    }

    if (Object.keys(updates).length > 0) {
      await convex.mutation(api.teamMembers.update, {
        id: member._id as any,
        ...updates,
      });
      console.log(`  ✓ ${emp.name}: updated ${Object.keys(updates).join(", ")} (rate=$${rate}/hr)`);
    } else {
      console.log(`  ✓ ${emp.name}: wages already correct`);
    }
  }
  console.log(`  Mapped ${ollieIdToConvexId.size} employees\n`);

  // ── Step 3: Migrate time entries ──
  console.log("Step 3: Migrating time entries...");
  console.log(`  Choquer entries: ${timeEntries.length}`);

  // Group breaks by time_entry_id
  const breaksByEntry = new Map<string, any[]>();
  for (const brk of breaks) {
    const list = breaksByEntry.get(brk.time_entry_id) ?? [];
    list.push(brk);
    breaksByEntry.set(brk.time_entry_id, list);
  }

  // Track ollie entry id → convex entry id for break migration
  const ollieEntryToConvexEntry = new Map<string, string>();

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of timeEntries) {
    const convexMemberId = ollieIdToConvexId.get(entry.employee_id);
    if (!convexMemberId) {
      skipped++;
      continue;
    }

    // Map Ollie columns → Convex fields
    const clockIn = entry.clock_in || null;
    const clockOut = entry.clock_out || null;
    const isSickDay = entry.is_sick_day === true;
    const isHalfSickDay = entry.is_half_sick_day === true;
    const isVacationDay = entry.is_vacation_day === true;
    const adminNotes = entry.admin_notes || undefined;
    const pendingApproval = entry.pending_approval === true ? true : undefined;
    const sickHoursUsed = entry.sick_hours_used != null ? parseFloat(entry.sick_hours_used) : undefined;

    // Parse change_request (may be JSON string or object)
    let changeRequest: any = undefined;
    if (entry.change_request) {
      if (typeof entry.change_request === "string") {
        try {
          changeRequest = JSON.parse(entry.change_request);
        } catch {
          changeRequest = entry.change_request;
        }
      } else {
        changeRequest = entry.change_request;
      }
    }

    // Compute break minutes for this entry (Math.floor to match Ollie)
    const entryBreaks = breaksByEntry.get(entry.id) ?? [];
    let totalBreakMinutes = 0;
    for (const brk of entryBreaks) {
      if (brk.start_time && brk.end_time) {
        const dur = Math.floor(
          (new Date(brk.end_time).getTime() - new Date(brk.start_time).getTime()) / 60000
        );
        totalBreakMinutes += Math.max(0, dur);
      }
    }

    // Compute worked minutes: Math.floor to match Ollie's calculateMinutes()
    let workedMinutes: number | undefined;
    if (clockIn && clockOut) {
      const grossMinutes = Math.floor(
        (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000
      );
      workedMinutes = Math.max(0, grossMinutes - totalBreakMinutes);
    }

    // Detect issues (thresholds match Ollie: 480min=8h overtime, 360min=6h no-break)
    const issues: string[] = [];
    if (!clockOut && !isSickDay && !isVacationDay) {
      issues.push("MISSING_CLOCK_OUT");
    }
    if (workedMinutes && workedMinutes > 480) {
      issues.push("OVERTIME_WARNING");
    }
    if (workedMinutes && workedMinutes > 360 && entryBreaks.length === 0) {
      issues.push("LONG_SHIFT_NO_BREAK");
    }

    // Fallback clockIn: use midnight of entry date
    const clockInTime = clockIn || `${entry.date}T00:00:00.000Z`;

    try {
      const inserted = await convex.mutation(
        api.timesheetEntries.insertHistorical,
        {
          teamMemberId: convexMemberId as any,
          date: entry.date,
          clockInTime,
          clockOutTime: clockOut || undefined,
          totalBreakMinutes: totalBreakMinutes || undefined,
          workedMinutes: workedMinutes ?? undefined,
          isSickDay: isSickDay || undefined,
          isHalfSickDay: isHalfSickDay || undefined,
          isVacation: isVacationDay || undefined,
          note: adminNotes,
          issues: issues.length > 0 ? issues : undefined,
          pendingApproval,
          sickHoursUsed,
          changeRequest,
        }
      );

      if (inserted) {
        ollieEntryToConvexEntry.set(entry.id, (inserted as any)._id);
      }

      migrated++;
      if (migrated % 25 === 0) {
        console.log(`  ... ${migrated}/${timeEntries.length} entries migrated`);
      }
    } catch (err: any) {
      console.error(`  Error on entry ${entry.id} (${entry.date}):`, err.message);
      errors++;
    }
  }

  console.log(`  Entries: ${migrated} migrated, ${skipped} skipped, ${errors} errors\n`);

  // ── Step 4: Migrate breaks ──
  console.log("Step 4: Migrating breaks...");
  let breaksMigrated = 0;
  let breaksSkipped = 0;
  let breakErrors = 0;

  for (const brk of breaks) {
    // Only migrate breaks for entries we successfully migrated
    const convexEntryId = ollieEntryToConvexEntry.get(brk.time_entry_id);
    if (!convexEntryId) {
      breaksSkipped++;
      continue;
    }

    let durationMinutes: number | undefined;
    if (brk.start_time && brk.end_time) {
      durationMinutes = Math.round(
        (new Date(brk.end_time).getTime() - new Date(brk.start_time).getTime()) / 60000
      );
    }

    try {
      await convex.mutation(api.timesheetBreaks.insertHistorical, {
        timesheetEntryId: convexEntryId as any,
        startTime: brk.start_time,
        endTime: brk.end_time || undefined,
        breakType: brk.break_type || "unpaid",
        durationMinutes,
      });
      breaksMigrated++;
      if (breaksMigrated % 50 === 0) {
        console.log(`  ... ${breaksMigrated} breaks migrated`);
      }
    } catch (err: any) {
      console.error(`  Error on break ${brk.id}:`, err.message);
      breakErrors++;
    }
  }

  console.log(`  Breaks: ${breaksMigrated} migrated, ${breaksSkipped} skipped, ${breakErrors} errors\n`);

  // ── Step 5: Migrate settings from Ollie → Convex timesheetSettings ──
  console.log("Step 5: Migrating settings from Ollie...");

  const settingsMap: Record<string, any> = {};
  for (const s of settings) {
    if (s.key && s.value !== undefined) {
      settingsMap[s.key] = s.value;
    }
  }

  const settingsUpdate: Record<string, any> = {};
  if (settingsMap.bookkeeper_email) {
    settingsUpdate.bookkeeperEmail = settingsMap.bookkeeper_email;
  }
  if (settingsMap.company_logo_url) {
    settingsUpdate.companyLogoUrl = settingsMap.company_logo_url;
  }
  if (settingsMap.standard_work_day_hours) {
    settingsUpdate.standardWorkDayHours = parseFloat(settingsMap.standard_work_day_hours);
  }
  if (settingsMap.sick_hours_total) {
    settingsUpdate.sickHoursTotal = parseFloat(settingsMap.sick_hours_total);
  }
  if (settingsMap.half_day_sick_cutoff_time) {
    settingsUpdate.halfDaySickCutoffTime = settingsMap.half_day_sick_cutoff_time;
  }
  if (settingsMap.overtime_threshold_minutes) {
    settingsUpdate.overtimeThresholdMinutes = parseInt(settingsMap.overtime_threshold_minutes);
  }
  if (settingsMap.default_vacation_days_per_year) {
    settingsUpdate.defaultVacationDaysPerYear = parseInt(settingsMap.default_vacation_days_per_year);
  }

  if (Object.keys(settingsUpdate).length > 0) {
    await convex.mutation(api.timesheetSettings.update, settingsUpdate);
    console.log(`  Migrated ${Object.keys(settingsUpdate).length} settings: ${Object.keys(settingsUpdate).join(", ")}`);
  } else {
    console.log("  No settings found to migrate");
  }
  console.log();

  // ── Summary ──
  console.log("=== Migration Complete ===");
  console.log(`  Employees synced: ${ollieIdToConvexId.size}`);
  console.log(`  Time entries: ${migrated} migrated`);
  console.log(`  Breaks: ${breaksMigrated} migrated`);
  console.log(`  Settings: ${Object.keys(settingsUpdate).length} migrated`);
  console.log(`  Errors: ${errors + breakErrors}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
