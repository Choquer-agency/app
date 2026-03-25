/**
 * Quick script to dump March 2026 time_entries with correct column names
 * and compute accurate totals to match against Ollie's payroll view.
 */

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

async function main() {
  // Get Choquer employees (owner_id = 9a518987...)
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("owner_id", "9a518987-a4c5-43bf-ab75-557f05c9fca1");

  const choquerEmps = (employees ?? []).filter(
    (e) => e.is_active && e.hourly_rate !== null
  );

  console.log("=== Choquer Active Employees ===");
  for (const emp of choquerEmps) {
    console.log(
      `  ${emp.name} | ${emp.email} | role: ${emp.role} | rate: $${emp.hourly_rate}/hr | vacation_days: ${emp.vacation_days_total}`
    );
  }

  // Get March entries
  const { data: marchEntries } = await supabase
    .from("time_entries")
    .select("*")
    .gte("date", "2026-03-01")
    .lte("date", "2026-03-23")
    .order("date", { ascending: true });

  // Get ALL breaks for these entries
  const entryIds = (marchEntries ?? []).map((e) => e.id);
  const { data: allBreaks } = await supabase
    .from("breaks")
    .select("*")
    .in("time_entry_id", entryIds);

  // Group breaks by entry
  const breaksByEntry = new Map<string, any[]>();
  for (const brk of allBreaks ?? []) {
    const list = breaksByEntry.get(brk.time_entry_id) ?? [];
    list.push(brk);
    breaksByEntry.set(brk.time_entry_id, list);
  }

  console.log("\n=== March 1-23, 2026 Payroll ===\n");

  let grandTotalMinutes = 0;
  let grandTotalPay = 0;

  for (const emp of choquerEmps) {
    const empEntries = (marchEntries ?? []).filter(
      (e) => e.employee_id === emp.id
    );

    let totalWorkedMinutes = 0;
    let daysWorked = new Set<string>();
    let sickDays = 0;
    let vacationDays = 0;

    for (const entry of empEntries) {
      if (entry.is_sick_day) sickDays++;
      if (entry.is_vacation_day) vacationDays++;

      if (entry.clock_in && entry.clock_out) {
        const clockInMs = new Date(entry.clock_in).getTime();
        const clockOutMs = new Date(entry.clock_out).getTime();
        const grossMinutes = Math.round((clockOutMs - clockInMs) / 60000);

        // Subtract breaks
        const entryBreaks = breaksByEntry.get(entry.id) ?? [];
        let breakMinutes = 0;
        for (const brk of entryBreaks) {
          if (brk.start_time && brk.end_time) {
            const dur = Math.round(
              (new Date(brk.end_time).getTime() -
                new Date(brk.start_time).getTime()) /
                60000
            );
            breakMinutes += Math.max(0, dur);
          }
        }

        const netMinutes = Math.max(0, grossMinutes - breakMinutes);
        totalWorkedMinutes += netMinutes;
        daysWorked.add(entry.date);
      }
    }

    const hours = Math.floor(totalWorkedMinutes / 60);
    const mins = totalWorkedMinutes % 60;
    const totalPay = (totalWorkedMinutes / 60) * (emp.hourly_rate ?? 0);

    grandTotalMinutes += totalWorkedMinutes;
    grandTotalPay += totalPay;

    console.log(
      `${emp.name} (${emp.role})` +
        `\n  Hours: ${hours}h ${mins}m  |  Days: ${daysWorked.size}  |  Sick: ${sickDays}  |  Vacation: ${vacationDays}` +
        `\n  Rate: $${emp.hourly_rate}/hr  |  Pay: $${totalPay.toFixed(2)}\n`
    );

    // Show daily breakdown
    for (const entry of empEntries) {
      const entryBreaks = breaksByEntry.get(entry.id) ?? [];
      let breakMins = 0;
      for (const brk of entryBreaks) {
        if (brk.start_time && brk.end_time) {
          breakMins += Math.round(
            (new Date(brk.end_time).getTime() -
              new Date(brk.start_time).getTime()) /
              60000
          );
        }
      }

      if (entry.clock_in && entry.clock_out) {
        const gross = Math.round(
          (new Date(entry.clock_out).getTime() -
            new Date(entry.clock_in).getTime()) /
            60000
        );
        const net = Math.max(0, gross - breakMins);
        console.log(
          `    ${entry.date}: ${entry.clock_in} → ${entry.clock_out} | gross ${Math.floor(gross / 60)}h${gross % 60}m - break ${breakMins}m = ${Math.floor(net / 60)}h${net % 60}m${entry.is_sick_day ? " [SICK]" : ""}${entry.is_vacation_day ? " [VACATION]" : ""}`
        );
      } else {
        console.log(
          `    ${entry.date}: clock_in=${entry.clock_in} clock_out=${entry.clock_out} ${entry.is_sick_day ? "[SICK]" : ""}${entry.is_vacation_day ? "[VACATION]" : ""}`
        );
      }
    }
    console.log();
  }

  const gh = Math.floor(grandTotalMinutes / 60);
  const gm = grandTotalMinutes % 60;
  console.log(`=== TOTALS ===`);
  console.log(`Total hours: ${gh}h ${gm}m`);
  console.log(`Total payroll: $${grandTotalPay.toFixed(2)}`);
  console.log(`Team members: ${choquerEmps.length}`);
}

main().catch(console.error);
