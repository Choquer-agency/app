/**
 * Verification script: Compare Ollie Supabase data with Convex data
 *
 * Usage:
 *   npx tsx scripts/verify-timesheet-migration.ts
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
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.OLLIE_SUPABASE_SERVICE_KEY!;

const convex = new ConvexHttpClient(CONVEX_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CHOQUER_OWNER_ID = "9a518987-a4c5-43bf-ab75-557f05c9fca1";

// Emails to skip (test accounts)
const SKIP_EMAILS = new Set(["emily@penni.ca"]);

async function main() {
  console.log("=== Timesheet Migration Verification ===\n");

  // Fetch Ollie data
  const { data: ollieEmployees } = await supabase
    .from("employees")
    .select("*")
    .eq("owner_id", CHOQUER_OWNER_ID);

  const { data: ollieEntries } = await supabase
    .from("time_entries")
    .select("*")
    .eq("owner_id", CHOQUER_OWNER_ID);

  const { data: ollieBreaks } = await supabase
    .from("breaks")
    .select("*")
    .eq("owner_id", CHOQUER_OWNER_ID);

  // Fetch Convex data
  const convexEntries: any[] = await convex.query(api.timesheetEntries.listByDateRange, {
    startDate: "2020-01-01",
    endDate: "2030-12-31",
    limit: 5000,
  });

  const convexMembers: any[] = await convex.query(api.teamMembers.list, { activeOnly: false });

  // Build mappings
  const emailToConvexMember = new Map<string, any>();
  for (const m of convexMembers) {
    emailToConvexMember.set((m.email || "").toLowerCase(), m);
  }

  const activeOllieEmployees = (ollieEmployees || []).filter(
    (e) => e.is_active && e.email && !SKIP_EMAILS.has(e.email.toLowerCase())
  );

  const ollieIdToEmail = new Map<string, string>();
  for (const emp of activeOllieEmployees) {
    ollieIdToEmail.set(emp.id, (emp.email || "").toLowerCase());
  }

  // Group ollie entries by employee email
  const ollieEntriesByEmail = new Map<string, any[]>();
  for (const entry of ollieEntries || []) {
    const email = ollieIdToEmail.get(entry.employee_id);
    if (!email) continue;
    const list = ollieEntriesByEmail.get(email) ?? [];
    list.push(entry);
    ollieEntriesByEmail.set(email, list);
  }

  // Group convex entries by email
  const memberIdToEmail = new Map<string, string>();
  for (const m of convexMembers) {
    memberIdToEmail.set(m._id, (m.email || "").toLowerCase());
  }

  const convexEntriesByEmail = new Map<string, any[]>();
  for (const entry of convexEntries) {
    const email = memberIdToEmail.get(entry.teamMemberId);
    if (!email) continue;
    const list = convexEntriesByEmail.get(email) ?? [];
    list.push(entry);
    convexEntriesByEmail.set(email, list);
  }

  // Group ollie breaks by time_entry_id
  const ollieBreaksByEntry = new Map<string, any[]>();
  for (const brk of ollieBreaks || []) {
    const list = ollieBreaksByEntry.get(brk.time_entry_id) ?? [];
    list.push(brk);
    ollieBreaksByEntry.set(brk.time_entry_id, list);
  }

  console.log("--- Per-Employee Comparison ---\n");

  let totalMismatches = 0;

  for (const emp of activeOllieEmployees) {
    const email = (emp.email || "").toLowerCase();
    const ollieEmpEntries = ollieEntriesByEmail.get(email) ?? [];
    const convexEmpEntries = convexEntriesByEmail.get(email) ?? [];

    const ollieCount = ollieEmpEntries.length;
    const convexCount = convexEmpEntries.length;

    const ollieWorkedMins = ollieEmpEntries.reduce((sum: number, e: any) => {
      if (!e.clock_in || !e.clock_out) return sum;
      const gross = Math.floor(
        (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000
      );
      // Calculate break minutes for this entry
      const entryBreaks = ollieBreaksByEntry.get(e.id) ?? [];
      let breakMins = 0;
      for (const brk of entryBreaks) {
        if (brk.start_time && brk.end_time) {
          breakMins += Math.max(
            0,
            Math.floor((new Date(brk.end_time).getTime() - new Date(brk.start_time).getTime()) / 60000)
          );
        }
      }
      return sum + Math.max(0, gross - breakMins);
    }, 0);

    const convexWorkedMins = convexEmpEntries.reduce(
      (sum: number, e: any) => sum + (e.workedMinutes ?? 0),
      0
    );

    const ollieSick = ollieEmpEntries.filter((e: any) => e.is_sick_day).length;
    const convexSick = convexEmpEntries.filter((e: any) => e.isSickDay).length;

    const ollieVacation = ollieEmpEntries.filter((e: any) => e.is_vacation_day).length;
    const convexVacation = convexEmpEntries.filter((e: any) => e.isVacation).length;

    const countMatch = ollieCount === convexCount;
    const workMatch = Math.abs(ollieWorkedMins - convexWorkedMins) <= 1;
    const sickMatch = ollieSick === convexSick;
    const vacMatch = ollieVacation === convexVacation;

    const allMatch = countMatch && workMatch && sickMatch && vacMatch;
    const status = allMatch ? "✅ OK" : "❌ MISMATCH";

    if (!allMatch) totalMismatches++;

    console.log(`${status} ${emp.name} (${email})`);
    console.log(`  Entries:  Ollie=${ollieCount}  Convex=${convexCount}  ${countMatch ? "✓" : "✗"}`);
    console.log(`  Worked:   Ollie=${ollieWorkedMins}m  Convex=${convexWorkedMins}m  ${workMatch ? "✓" : `✗ (diff=${Math.abs(ollieWorkedMins - convexWorkedMins)}m)`}`);
    console.log(`  Sick:     Ollie=${ollieSick}  Convex=${convexSick}  ${sickMatch ? "✓" : "✗"}`);
    console.log(`  Vacation: Ollie=${ollieVacation}  Convex=${convexVacation}  ${vacMatch ? "✓" : "✗"}`);
    console.log();
  }

  // Break verification
  console.log("--- Break Verification ---\n");

  const totalOllieBreaks = (ollieBreaks || []).filter((b: any) => {
    const entryEmail = ollieIdToEmail.get(
      (ollieEntries || []).find((e: any) => e.id === b.time_entry_id)?.employee_id
    );
    return entryEmail && !SKIP_EMAILS.has(entryEmail);
  }).length;

  // Count convex breaks
  let totalConvexBreaks = 0;
  for (const entry of convexEntries) {
    const breaks: any[] = await convex.query(api.timesheetBreaks.listByEntry, {
      timesheetEntryId: entry._id,
    });
    totalConvexBreaks += breaks.length;
  }

  console.log(`Total breaks: Ollie=${totalOllieBreaks}  Convex=${totalConvexBreaks}`);
  console.log(totalOllieBreaks === totalConvexBreaks ? "✅ Break count matches" : `❌ Break count mismatch (diff=${Math.abs(totalOllieBreaks - totalConvexBreaks)})`);

  console.log("\n=== Summary ===");
  console.log(`Employees verified: ${activeOllieEmployees.length}`);
  console.log(`Mismatches: ${totalMismatches}`);
  console.log(`Total entries: Ollie=${(ollieEntries || []).filter((e: any) => e.owner_id === CHOQUER_OWNER_ID).length}  Convex=${convexEntries.length}`);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
