/**
 * Re-migration: Fixes incorrect field names (clock_in not clock_in_time).
 * 1. Deletes all existing timesheetEntries + breaks
 * 2. Re-imports from Supabase with correct field names
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.OLLIE_SUPABASE_SERVICE_KEY!
);
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function main() {
  console.log("=== Re-migration: Fixing clock_in/clock_out field names ===\n");

  // Step 1: Delete all existing bad data in batches
  console.log("Step 1: Clearing existing data...");
  let totalDeleted = 0;
  while (true) {
    const deleted: number = await convex.mutation(
      api.timesheetEntries.removeBatch,
      { limit: 50 }
    );
    totalDeleted += deleted;
    if (deleted === 0) break;
    process.stdout.write(`  Deleted ${totalDeleted} entries...\r`);
  }
  console.log(`  Deleted ${totalDeleted} entries total\n`);

  // Step 2: Fetch team members
  console.log("Step 2: Mapping employees...");
  const teamMembers = await convex.query(api.teamMembers.list, {
    activeOnly: false,
  });
  const emailToMemberId = new Map<string, string>();
  for (const m of teamMembers as any[]) {
    emailToMemberId.set(m.email.toLowerCase(), m._id);
  }

  // Step 3: Fetch Ollie employees
  const { data: employees } = await supabase.from("employees").select("*");
  const ollieIdToConvexId = new Map<string, string>();
  for (const emp of employees ?? []) {
    const convexId = emailToMemberId.get(emp.email?.toLowerCase());
    if (convexId) {
      ollieIdToConvexId.set(emp.id, convexId);
      console.log(`  ✓ ${emp.name} → ${convexId}`);
    }
  }

  // Step 4: Fetch all time entries
  console.log("\nStep 3: Fetching Supabase entries...");
  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("*")
    .order("date", { ascending: true });
  console.log(`  ${timeEntries?.length ?? 0} entries`);

  // Step 5: Fetch breaks
  const { data: breaks } = await supabase.from("breaks").select("*");
  const breaksByEntry = new Map<string, any[]>();
  for (const brk of breaks ?? []) {
    const list = breaksByEntry.get(brk.time_entry_id) ?? [];
    list.push(brk);
    breaksByEntry.set(brk.time_entry_id, list);
  }
  console.log(`  ${breaks?.length ?? 0} breaks\n`);

  // Step 6: Import with CORRECT field names (clock_in, clock_out)
  console.log("Step 4: Importing...");
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of timeEntries ?? []) {
    const convexMemberId = ollieIdToConvexId.get(entry.employee_id);
    if (!convexMemberId) {
      skipped++;
      continue;
    }

    // CORRECT: clock_in and clock_out (not clock_in_time)
    const clockIn: string | null = entry.clock_in;
    const clockOut: string | null = entry.clock_out;

    if (!clockIn && !entry.is_sick_day && !entry.is_vacation_day) {
      skipped++;
      continue;
    }

    const entryBreaks = breaksByEntry.get(entry.id) ?? [];
    let totalBreakMinutes = 0;
    for (const brk of entryBreaks) {
      if (brk.end_time) {
        totalBreakMinutes += Math.max(
          0,
          Math.round(
            (new Date(brk.end_time).getTime() -
              new Date(brk.start_time).getTime()) /
              60000
          )
        );
      }
    }

    let workedMinutes: number | undefined;
    if (clockIn && clockOut) {
      const total = Math.round(
        (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000
      );
      workedMinutes = Math.max(0, total - totalBreakMinutes);
    }

    const issues: string[] = [];
    if (!clockOut && clockIn && !entry.is_sick_day && !entry.is_vacation_day) {
      issues.push("MISSING_CLOCK_OUT");
    }
    if (workedMinutes && workedMinutes > 480) {
      issues.push("OVERTIME_WARNING");
    }

    try {
      const inserted = await convex.mutation(
        api.timesheetEntries.insertHistorical,
        {
          teamMemberId: convexMemberId as any,
          date: entry.date,
          clockInTime: clockIn || `${entry.date}T09:00:00.000Z`,
          clockOutTime: clockOut ?? undefined,
          totalBreakMinutes: totalBreakMinutes || undefined,
          workedMinutes: workedMinutes ?? undefined,
          isSickDay: entry.is_sick_day || undefined,
          isHalfSickDay: entry.is_half_sick_day || undefined,
          isVacation: entry.is_vacation_day || undefined,
          issues: issues.length > 0 ? issues : undefined,
        }
      );

      if (inserted && entryBreaks.length > 0) {
        const entryId = (inserted as any)._id;
        for (const brk of entryBreaks) {
          let dur: number | undefined;
          if (brk.end_time) {
            dur = Math.round(
              (new Date(brk.end_time).getTime() -
                new Date(brk.start_time).getTime()) /
                60000
            );
          }
          await convex.mutation(api.timesheetBreaks.insertHistorical, {
            timesheetEntryId: entryId as any,
            startTime: brk.start_time,
            endTime: brk.end_time ?? undefined,
            breakType: brk.type ?? "unpaid",
            durationMinutes: dur,
          });
        }
      }

      migrated++;
      if (migrated % 50 === 0) console.log(`  ... ${migrated}`);
    } catch (err: any) {
      console.error(`  Error: ${err.message?.slice(0, 120)}`);
      errors++;
    }
  }

  console.log("\n=== Done ===");
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
