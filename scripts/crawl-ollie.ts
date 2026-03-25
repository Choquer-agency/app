/**
 * Crawl Ollie Supabase — discover all tables, schemas, row counts, and sample data.
 * This gives us a complete picture of what needs to be migrated 1:1.
 *
 * Usage: npx tsx scripts/crawl-ollie.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.OLLIE_SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or OLLIE_SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("=== CRAWLING OLLIE SUPABASE ===\n");
  console.log(`URL: ${SUPABASE_URL}\n`);

  // Probe known table names to discover what exists
  const knownTables = [
    "employees",
    "time_entries",
    "breaks",
    "sick_days",
    "vacation_days",
    "vacation_requests",
    "settings",
    "pay_periods",
    "payroll",
    "payroll_reports",
    "departments",
    "roles",
    "shifts",
    "overtime",
    "holidays",
    "leave_requests",
    "leave_balances",
    "profiles",
    "users",
  ];

  console.log("--- Probing known table names ---\n");

  const foundTables: string[] = [];

  for (const table of knownTables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: false })
        .limit(3);

      if (!error) {
        foundTables.push(table);
        console.log(`\n========================================`);
        console.log(`TABLE: ${table} (${count ?? data?.length ?? "?"} rows)`);
        console.log(`========================================`);

        if (data && data.length > 0) {
          // Show columns
          const columns = Object.keys(data[0]);
          console.log(`Columns: ${columns.join(", ")}`);
          console.log(`\nSample rows:`);
          for (const row of data) {
            console.log(JSON.stringify(row, null, 2));
          }
        } else {
          console.log("(empty table)");
        }
      }
    } catch (e) {
      // Table doesn't exist, skip
    }
  }

  // Now dump FULL data for critical tables
  console.log("\n\n=== FULL DATA DUMPS ===\n");

  // 1. EMPLOYEES — full dump (need wages, roles, everything)
  console.log("\n========================================");
  console.log("FULL DUMP: employees");
  console.log("========================================");
  const { data: allEmployees } = await supabase.from("employees").select("*");
  if (allEmployees) {
    for (const emp of allEmployees) {
      console.log(JSON.stringify(emp, null, 2));
    }
  }

  // 2. TIME_ENTRIES — count and date range
  console.log("\n========================================");
  console.log("TIME_ENTRIES: stats and March 2026 data");
  console.log("========================================");

  const { count: totalEntries } = await supabase
    .from("time_entries")
    .select("*", { count: "exact", head: true });
  console.log(`Total time_entries: ${totalEntries}`);

  // Get date range
  const { data: earliest } = await supabase
    .from("time_entries")
    .select("date")
    .order("date", { ascending: true })
    .limit(1);
  const { data: latest } = await supabase
    .from("time_entries")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  console.log(`Date range: ${earliest?.[0]?.date} → ${latest?.[0]?.date}`);

  // March 2026 entries for comparison with the screenshots
  const { data: marchEntries } = await supabase
    .from("time_entries")
    .select("*")
    .gte("date", "2026-03-01")
    .lte("date", "2026-03-24")
    .order("date", { ascending: true });

  if (marchEntries) {
    console.log(`\nMarch 2026 entries: ${marchEntries.length}`);

    // Group by employee
    const byEmployee = new Map<string, any[]>();
    for (const entry of marchEntries) {
      const list = byEmployee.get(entry.employee_id) ?? [];
      list.push(entry);
      byEmployee.set(entry.employee_id, list);
    }

    for (const [empId, entries] of byEmployee) {
      const emp = allEmployees?.find((e: any) => e.id === empId);
      let totalMinutes = 0;
      let daysWorked = new Set<string>();
      let sickDays = 0;
      let vacationDays = 0;

      for (const entry of entries) {
        if (entry.is_sick_day) sickDays++;
        if (entry.is_vacation) vacationDays++;
        if (entry.clock_in_time && entry.clock_out_time) {
          const dur = Math.round(
            (new Date(entry.clock_out_time).getTime() -
              new Date(entry.clock_in_time).getTime()) /
              60000
          );
          totalMinutes += Math.max(0, dur);
          daysWorked.add(entry.date);
        } else if (entry.clock_in_time) {
          daysWorked.add(entry.date);
        }
      }

      // Subtract breaks
      const { data: allBreaks } = await supabase
        .from("breaks")
        .select("*")
        .in(
          "time_entry_id",
          entries.map((e: any) => e.id)
        );

      let totalBreakMinutes = 0;
      if (allBreaks) {
        for (const brk of allBreaks) {
          if (brk.start_time && brk.end_time) {
            const dur = Math.round(
              (new Date(brk.end_time).getTime() -
                new Date(brk.start_time).getTime()) /
                60000
            );
            totalBreakMinutes += Math.max(0, dur);
          }
        }
      }

      const netMinutes = totalMinutes - totalBreakMinutes;
      const hours = Math.floor(netMinutes / 60);
      const mins = netMinutes % 60;

      console.log(
        `\n  ${emp?.name ?? empId} (${emp?.email ?? "?"}):` +
          `\n    Entries: ${entries.length}` +
          `\n    Days worked: ${daysWorked.size}` +
          `\n    Gross time: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` +
          `\n    Break time: ${Math.floor(totalBreakMinutes / 60)}h ${totalBreakMinutes % 60}m` +
          `\n    NET hours: ${hours}h ${mins}m` +
          `\n    Sick days: ${sickDays}` +
          `\n    Vacation days: ${vacationDays}` +
          `\n    Hourly rate: ${emp?.hourly_rate ?? emp?.wage ?? emp?.rate ?? "NOT FOUND"}` +
          `\n    Role/Position: ${emp?.role ?? emp?.position ?? emp?.department ?? emp?.title ?? "NOT FOUND"}`
      );
    }
  }

  // 3. BREAKS — full stats
  console.log("\n========================================");
  console.log("BREAKS: stats");
  console.log("========================================");
  const { count: totalBreaks } = await supabase
    .from("breaks")
    .select("*", { count: "exact", head: true });
  console.log(`Total breaks: ${totalBreaks}`);

  // Sample breaks
  const { data: sampleBreaks } = await supabase
    .from("breaks")
    .select("*")
    .limit(5);
  if (sampleBreaks) {
    console.log("\nSample breaks:");
    for (const b of sampleBreaks) {
      console.log(JSON.stringify(b, null, 2));
    }
  }

  console.log("\n\n=== FOUND TABLES ===");
  console.log(foundTables.join(", "));
  console.log("\n=== CRAWL COMPLETE ===");
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
