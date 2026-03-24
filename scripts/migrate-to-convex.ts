/**
 * Data migration script: Neon PostgreSQL → Convex
 *
 * Usage:
 *   npx tsx scripts/migrate-to-convex.ts
 *
 * Requires:
 *   - POSTGRES_URL in .env.local (Neon connection string)
 *   - NEXT_PUBLIC_CONVEX_URL in .env.local (Convex deployment URL)
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import pg from "pg";
import { readFileSync, writeFileSync } from "fs";
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

const POSTGRES_URL = process.env.POSTGRES_URL;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!POSTGRES_URL) throw new Error("Missing POSTGRES_URL in .env.local");
if (!CONVEX_URL) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");

const convex = new ConvexHttpClient(CONVEX_URL);
const pool = new pg.Pool({ connectionString: POSTGRES_URL });

// ID mapping: old integer ID → new Convex document ID
const idMap = {
  teamMembers: new Map<number, string>(),
  clients: new Map<number, string>(),
  packages: new Map<number, string>(),
  clientPackages: new Map<number, string>(),
  announcements: new Map<number, string>(),
};

async function pgQuery(sql: string): Promise<any[]> {
  const result = await pool.query(sql);
  return result.rows;
}

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

function dateStr(val: Date | null | undefined): string | undefined {
  if (!val) return undefined;
  return val.toISOString().split("T")[0];
}

// ────────────────────────────────────────────────────────────────────────────

async function migrateTeamMembers() {
  log("Migrating team_members...");
  const rows = await pgQuery("SELECT * FROM team_members ORDER BY id");
  for (const row of rows) {
    const doc = await convex.mutation(api.migration.createTeamMemberWithAuth, {
      name: row.name,
      email: (row.email || "").toLowerCase(),
      role: row.role || "",
      calLink: row.cal_link || "",
      profilePicUrl: row.profile_pic_url || "",
      color: row.color || "",
      startDate: dateStr(row.start_date),
      birthday: dateStr(row.birthday),
      active: row.active ?? true,
      roleLevel: row.role_level || "employee",
      passwordHash: row.password_hash || undefined,
      lastLogin: row.last_login ? row.last_login.toISOString() : undefined,
      slackUserId: row.slack_user_id || "",
      availableHoursPerWeek: parseFloat(row.available_hours_per_week) || 40,
      hourlyRate: row.hourly_rate != null ? parseFloat(row.hourly_rate) : undefined,
      salary: row.salary != null ? parseFloat(row.salary) : undefined,
      payType: row.pay_type || "hourly",
      tags: row.tags || [],
    });
    if (doc) {
      idMap.teamMembers.set(row.id, doc._id);
    }
  }
  log(`  → ${idMap.teamMembers.size} team members migrated`);
}

async function migrateClients() {
  log("Migrating clients...");
  const rows = await pgQuery("SELECT * FROM clients ORDER BY id");
  for (const row of rows) {
    const doc = await convex.mutation(api.clients.create, {
      name: row.name,
      ga4PropertyId: row.ga4_property_id || "",
      gscSiteUrl: row.gsc_site_url || "",
      seRankingsProjectId: row.se_rankings_project_id || "",
      calLink: row.cal_link || "",
      notionPageUrl: row.notion_page_url || "",
      active: row.active ?? true,
      websiteUrl: row.website_url || "",
      contactName: row.contact_name || "",
      contactEmail: row.contact_email || "",
      contactPhone: row.contact_phone || "",
      contractStartDate: dateStr(row.contract_start_date),
      contractEndDate: dateStr(row.contract_end_date),
      mrr: parseFloat(row.mrr) || 0,
      country: row.country || "CA",
      seoHoursAllocated: parseFloat(row.seo_hours_allocated) || 0,
      accountSpecialist: row.account_specialist || "",
      addressLine1: row.address_line1 || "",
      addressLine2: row.address_line2 || "",
      city: row.city || "",
      provinceState: row.province_state || "",
      postalCode: row.postal_code || "",
      clientStatus: row.client_status || "active",
      offboardingDate: dateStr(row.offboarding_date),
      industry: row.industry || "",
      tags: row.tags || [],
      lastContactDate: row.last_contact_date ? row.last_contact_date.toISOString() : undefined,
      nextReviewDate: dateStr(row.next_review_date),
      socialLinkedin: row.social_linkedin || "",
      socialFacebook: row.social_facebook || "",
      socialInstagram: row.social_instagram || "",
      socialX: row.social_x || "",
    });
    if (doc) {
      idMap.clients.set(row.id, doc._id);
    }
  }
  log(`  → ${idMap.clients.size} clients migrated`);
}

async function migratePackages() {
  log("Migrating packages...");
  const rows = await pgQuery("SELECT * FROM packages ORDER BY id");
  for (const row of rows) {
    const doc = await convex.mutation(api.packages.create, {
      name: row.name,
      description: row.description || "",
      defaultPrice: parseFloat(row.default_price) || 0,
      category: row.category || "other",
      billingFrequency: row.billing_frequency || "monthly",
      hoursIncluded: row.hours_included ? parseFloat(row.hours_included) : undefined,
      includedServices: row.included_services || [],
      setupFee: row.setup_fee ? parseFloat(row.setup_fee) : 0,
      active: row.active ?? true,
    });
    if (doc) {
      idMap.packages.set(row.id, doc._id);
    }
  }
  log(`  → ${idMap.packages.size} packages migrated`);
}

async function migrateClientPackages() {
  log("Migrating client_packages...");
  const rows = await pgQuery("SELECT * FROM client_packages ORDER BY id");
  let count = 0;
  for (const row of rows) {
    const clientId = idMap.clients.get(row.client_id);
    const packageId = idMap.packages.get(row.package_id);
    if (!clientId || !packageId) {
      log(`  ⚠ Skipping client_package ${row.id}: missing client or package mapping`);
      continue;
    }
    const doc = await convex.mutation(api.clientPackages.create, {
      clientId: clientId as any,
      packageId: packageId as any,
      customPrice: row.custom_price ? parseFloat(row.custom_price) : undefined,
      customHours: row.custom_hours ? parseFloat(row.custom_hours) : undefined,
      applySetupFee: row.apply_setup_fee ?? false,
      customSetupFee: row.custom_setup_fee ? parseFloat(row.custom_setup_fee) : undefined,
      signupDate: dateStr(row.signup_date),
      contractEndDate: dateStr(row.contract_end_date),
      notes: row.notes || "",
    });
    if (doc) {
      idMap.clientPackages.set(row.id, doc._id);
      count++;
    }
  }
  log(`  → ${count} client packages migrated`);
}

async function seedCounter() {
  log("Seeding ticket number counter...");
  const rows = await pgQuery("SELECT last_value FROM ticket_number_seq");
  const currentMax = parseInt(rows[0]?.last_value) || 0;
  await convex.mutation(api.migration.seedCounter, {
    name: "ticket_number",
    value: currentMax,
  });
  log(`  → Counter seeded at ${currentMax}`);
}

async function migrateAnnouncements() {
  log("Migrating announcements...");
  const rows = await pgQuery("SELECT * FROM announcements ORDER BY id");
  let count = 0;
  for (const row of rows) {
    const authorId = idMap.teamMembers.get(row.author_id);
    if (!authorId) {
      log(`  ⚠ Skipping announcement ${row.id}: missing author mapping`);
      continue;
    }
    const doc = await convex.mutation(api.migration.createAnnouncement, {
      authorId: authorId as any,
      title: row.title,
      content: row.content || "",
      pinned: row.pinned ?? false,
      source: row.source || "manual",
      announcementType: row.announcement_type || "general",
      expiresAt: row.expires_at ? row.expires_at.toISOString() : undefined,
      imageUrl: row.image_url || "",
    });
    if (doc) {
      idMap.announcements.set(row.id, doc._id);
      count++;
    }
  }
  log(`  → ${count} announcements migrated`);

  // Migrate reactions
  log("Migrating announcement_reactions...");
  const reactions = await pgQuery("SELECT * FROM announcement_reactions ORDER BY id");
  let rCount = 0;
  for (const row of reactions) {
    const announcementId = idMap.announcements.get(row.announcement_id);
    const teamMemberId = idMap.teamMembers.get(row.team_member_id);
    if (!announcementId || !teamMemberId) continue;
    await convex.mutation(api.migration.createAnnouncementReaction, {
      announcementId: announcementId as any,
      teamMemberId: teamMemberId as any,
      emoji: row.emoji,
    });
    rCount++;
  }
  log(`  → ${rCount} reactions migrated`);
}

async function migrateCalendarEvents() {
  log("Migrating calendar_events...");
  const rows = await pgQuery("SELECT * FROM calendar_events ORDER BY id");
  let count = 0;
  for (const row of rows) {
    await convex.mutation(api.migration.createCalendarEvent, {
      title: row.title,
      eventDate: dateStr(row.event_date) ?? "",
      eventType: row.event_type || "custom",
      recurrence: row.recurrence || "none",
    });
    count++;
  }
  log(`  → ${count} calendar events migrated`);
}

async function migrateWeeklyQuotes() {
  log("Migrating weekly_quotes...");
  const rows = await pgQuery("SELECT * FROM weekly_quotes ORDER BY id");
  let count = 0;
  for (const row of rows) {
    await convex.mutation(api.migration.createWeeklyQuote, {
      quote: row.quote,
      author: row.author || "",
      weekStart: dateStr(row.week_start) ?? "",
      selected: row.selected ?? false,
    });
    count++;
  }
  log(`  → ${count} weekly quotes migrated`);
}

// ────────────────────────────────────────────────────────────────────────────

async function main() {
  log("=== Starting Neon → Convex migration ===\n");

  try {
    // Core tables
    await migrateTeamMembers();
    await migrateClients();
    await migratePackages();
    await migrateClientPackages();

    // Counter
    await seedCounter();

    // Bulletin data
    await migrateAnnouncements();
    await migrateCalendarEvents();
    await migrateWeeklyQuotes();

    log("\n=== Migration complete ===");
    log(`\nID Mappings:`);
    log(`  team_members: ${idMap.teamMembers.size}`);
    log(`  clients: ${idMap.clients.size}`);
    log(`  packages: ${idMap.packages.size}`);
    log(`  client_packages: ${idMap.clientPackages.size}`);
    log(`  announcements: ${idMap.announcements.size}`);

    // Save ID mappings for later phases
    const mappings: Record<string, Record<number, string>> = {};
    for (const [table, map] of Object.entries(idMap)) {
      mappings[table] = Object.fromEntries(map);
    }
    writeFileSync(
      resolve(__dirname, "id-mappings.json"),
      JSON.stringify(mappings, null, 2)
    );
    log("\nID mappings saved to scripts/id-mappings.json");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
