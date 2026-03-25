import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.OLLIE_SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Add VITE_SUPABASE_URL and OLLIE_SUPABASE_SERVICE_KEY to .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  // Check Mar 23 entries to see actual column structure
  const { data: entries, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("date", "2026-03-23");

  if (error) { console.error(error); return; }

  console.log("Mar 23 entries:", entries?.length);
  for (const e of entries ?? []) {
    console.log(JSON.stringify(e, null, 2));
  }
}
main();
