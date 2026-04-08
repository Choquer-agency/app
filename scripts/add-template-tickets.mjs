#!/usr/bin/env node

/**
 * Seeds the "Website Project" template into Convex with all phases, roles, and tickets.
 * Includes two process improvements:
 *   1. SEO Redirect & Migration Strategy (Kick Off, before Sitemap)
 *   2. Design to Dev Handoff Meeting (Wireframe, same day dev starts)
 *
 * Run: node scripts/add-template-tickets.mjs
 */

import { execSync } from "child_process";

const CWD = new URL("..", import.meta.url).pathname;

function convexRun(fn, args = {}) {
  const argsJson = JSON.stringify(args);
  const cmd = `npx convex run '${fn}' '${argsJson.replace(/'/g, "'\\''")}'`;
  const result = execSync(cmd, { cwd: CWD, encoding: "utf-8", timeout: 30000 });
  try {
    return JSON.parse(result.trim());
  } catch {
    return result.trim();
  }
}

// 1. Create template project
console.log("Creating Website Project template...");
const project = convexRun("projects:create", {
  name: "Website Project",
  description: "Full web development project template — from onboarding through launch and post-launch.",
  isTemplate: true,
  status: "active",
});
const projectId = project._id;
console.log(`  ✓ Template created: ${projectId}`);

// 2. Create groups/phases
console.log("Creating phases...");
const groups = {};
for (const [name, color, sortOrder] of [
  ["Kick Off", "#F59E0B", 0],
  ["Wireframe", "#3B82F6", 1],
  ["Development", "#EF4444", 2],
  ["Launch", "#10B981", 3],
]) {
  const g = convexRun("projectGroups:create", { projectId, name, color, sortOrder });
  groups[name] = g._id;
  console.log(`  ✓ ${name} (${color})`);
}

// 3. Create roles
console.log("Creating roles...");
const roles = {};
for (const [name, sortOrder] of [
  ["Project Manager", 0],
  ["SEO Strategist", 1],
  ["Designer", 2],
  ["Developer", 3],
  ["Copywriter", 4],
  ["Client", 5],
]) {
  const r = convexRun("projectTemplateRoles:create", { projectId, name, sortOrder });
  roles[name] = r._id;
  console.log(`  ✓ ${name}`);
}

// Helper to create a ticket
function ticket(title, groupName, roleName, dayStart, dayEnd, sortOrder, opts = {}) {
  return {
    title,
    projectId,
    groupId: groups[groupName],
    templateRoleId: roleName ? roles[roleName] : undefined,
    status: "needs_attention",
    priority: "normal",
    dayOffsetStart: dayStart,
    dayOffsetDue: dayEnd,
    sortOrder,
    isPersonal: false,
    isMeeting: opts.isMeeting ?? false,
    isEmail: opts.isEmail ?? false,
    assignAllRoles: false,
    ...(opts.description ? { description: opts.description, descriptionFormat: "plain" } : {}),
  };
}

// 4. Create all tickets
console.log("Creating tickets...");

const ticketDefs = [
  // ========== KICK OFF ==========
  ticket("Client Signs Up - Welcome Email", "Kick Off", "Project Manager", 0, 2, 1),
  ticket("Pre Onboarding Meeting", "Kick Off", null, 0, 2, 2),
  ticket("Audit", "Kick Off", "SEO Strategist", 2, 2, 3),
  ticket("Research", "Kick Off", null, 2, 2, 4),
  ticket("Competitor Analysis", "Kick Off", null, 2, 2, 5),
  ticket("Onboarding Meeting", "Kick Off", null, 4, 4, 6),
  ticket("Post Onboarding Meeting", "Kick Off", null, 4, 4, 7),
  ticket("Follow Up Email", "Kick Off", "Project Manager", 4, 4, 8),

  // NEW: SEO Redirect & Migration Strategy — before sitemap
  ticket("SEO Redirect & Migration Strategy", "Kick Off", "SEO Strategist", 5, 8, 9, {
    description: "Create a redirect and migration document before sitemap, design, and copy. Document includes:\n- Which existing pages are getting traffic\n- Which pages must be preserved\n- Where old URLs redirect to\n- Target keyword for each page\n\nPresent to the client during the strategy meeting.",
  }),

  ticket("Sitemap", "Kick Off", "Designer", 5, 9, 10),
  ticket("Keyword Map", "Kick Off", "SEO Strategist", 5, 9, 11),
  ticket("Keyword Heatmap", "Kick Off", "SEO Strategist", 5, 9, 12),
  ticket("Access To Google My Business", "Kick Off", "SEO Strategist", 5, 9, 13),
  ticket("Access To Website", "Kick Off", "SEO Strategist", 5, 9, 14),
  ticket("Access To Tag Manager", "Kick Off", "SEO Strategist", 5, 9, 15),
  ticket("Access To Analytics", "Kick Off", "SEO Strategist", 5, 9, 16),
  ticket("Example Of Keyword Use On Website", "Kick Off", "SEO Strategist", 5, 9, 17),
  ticket("Add Clarity To Website", "Kick Off", "SEO Strategist", 5, 9, 18),
  ticket("Google Folder Created", "Kick Off", "SEO Strategist", 5, 9, 19),
  ticket("3 Directions Wireframe", "Kick Off", "Designer", 5, 9, 20),
  ticket("2 Month Strategy", "Kick Off", "SEO Strategist", 5, 9, 21),
  ticket("Internal Final Review Meeting", "Kick Off", "SEO Strategist", 10, 10, 22),
  ticket("Kick Off Meeting", "Kick Off", "Project Manager", 11, 11, 23),

  // ========== WIREFRAME ==========
  ticket("SEO Page Outlines Strategy", "Wireframe", "SEO Strategist", 12, 17, 1),
  ticket("Email Outline To Client For Approval", "Wireframe", "Project Manager", 18, 18, 2),
  ticket("Copy Creation", "Wireframe", "Copywriter", 12, 20, 3),
  ticket("Wireframe", "Wireframe", "Designer", 12, 23, 4),
  ticket("Internal QA - Wireframe", "Wireframe", "Project Manager", 24, 24, 5),
  ticket("Wireframe Presentation", "Wireframe", "Project Manager", 25, 25, 6),
  ticket("Client - Wireframe Revisions Due R1", "Wireframe", "Client", 25, 27, 7),
  ticket("Implement Wireframe Revisions R1", "Wireframe", "Designer", 28, 31, 8),
  ticket("Wireframe Presentation R2", "Wireframe", "Designer", 32, 32, 9),
  ticket("Client - Wireframe Revisions Due R2", "Wireframe", "Client", 32, 34, 10),
  ticket("Implement Wireframe Revisions R2", "Wireframe", "Designer", 35, 38, 11),
  ticket("Wireframe Presentation R3", "Wireframe", "Designer", 39, 39, 12),
  ticket("Final Wireframe Touches / Sign Off", "Wireframe", "Designer", 40, 41, 13),

  // NEW: Design to Dev Handoff Meeting — same day development starts
  ticket("Design to Dev Handoff Meeting", "Wireframe", "Designer", 39, 39, 14, {
    isMeeting: true,
    description: "Formal handoff meeting between designer and developer. The designer walks through every page and every element, explaining:\n- Design intent and rationale\n- Interactions and expected behavior\n- Sticky/fixed sections\n- Tab/accordion behavior\n- Data sources and dynamic content\n\nDevelopers should never have to guess. Any unclear items must be resolved in this meeting before development begins.",
  }),

  // ========== DEVELOPMENT ==========
  ticket("Development", "Development", "Developer", 39, 55, 1),
  ticket("Internal QA - Development", "Development", "Project Manager", 56, 59, 2),
  ticket("Development QA Changes", "Development", null, 56, 59, 3),
  ticket("SEO Optimization", "Development", "SEO Strategist", 59, 62, 4),
  ticket("Development Presentation", "Development", "Project Manager", 60, 60, 5),
  ticket("Client Revisions Due - Dev R1", "Development", "Client", 60, 62, 6),
  ticket("Implement Development Revisions R1", "Development", "Developer", 63, 66, 7),
  ticket("Development Presentation R2", "Development", "Developer", 67, 67, 8),
  ticket("Client Revisions Due - Dev R2", "Development", "Client", 67, 69, 9),
  ticket("Implement Development Revisions R2", "Development", "Developer", 70, 73, 10),
  ticket("Development Presentation R3", "Development", "Developer", 74, 74, 11),
  ticket("Client Sign Off - Schedule Launch!", "Development", "Project Manager", 74, 76, 12),

  // ========== LAUNCH ==========
  ticket("Development Pre Launch Checklist", "Launch", "Developer", 77, 80, 1),
  ticket("Check pages on Google Chrome", "Launch", "Developer", null, null, 2),
  ticket("Check pages on Safari", "Launch", "Developer", null, null, 3),
  ticket("Check pages on Firefox", "Launch", "Developer", null, null, 4),
  ticket("Upload custom Fav Icon and Web Clip", "Launch", "Developer", null, null, 5),
  ticket("Remove Webflow Branding", "Launch", "Developer", null, null, 6),
  ticket("Timezone should be set to the clients timezone", "Launch", "Developer", null, null, 7),
  ticket("Custom branding logo should be added", "Launch", "Developer", null, null, 8),
  ticket("Launch Website", "Launch", "Developer", 81, 81, 9),
  ticket("SEO Post Launch Checklist", "Launch", "SEO Strategist", 81, 82, 10),
  ticket("Insight Pulse", "Launch", "SEO Strategist", null, null, 11),
  ticket("Analytics", "Launch", "SEO Strategist", null, null, 12),
  ticket("Tag Manager", "Launch", "SEO Strategist", null, null, 13),
  ticket("Search Console", "Launch", "SEO Strategist", null, null, 14),
  ticket("Clarity", "Launch", "SEO Strategist", null, null, 15),
  ticket("Google My Business", "Launch", "SEO Strategist", null, null, 16),
  ticket("Meta Titles / Meta Descriptions", "Launch", "SEO Strategist", null, null, 17),
  ticket("Plan and organise redirects from the old site", "Launch", "SEO Strategist", null, null, 18),
  ticket("Schema Markup", "Launch", "SEO Strategist", null, null, 19),
  ticket("Image Alt Texts", "Launch", "SEO Strategist", null, null, 20),
  ticket("Post Launch Meeting", "Launch", "Project Manager", 95, 95, 21),
  ticket("6 Month Strategy", "Launch", "SEO Strategist", null, null, 22),
];

let count = 0;
for (const t of ticketDefs) {
  // Clean up undefined values (Convex doesn't accept explicit undefined in args)
  const args = {};
  for (const [k, v] of Object.entries(t)) {
    if (v !== undefined && v !== null) args[k] = v;
  }
  convexRun("tickets:create", args);
  count++;
  if (count % 10 === 0) console.log(`  ${count}/${ticketDefs.length} tickets created...`);
}
console.log(`  ✓ All ${count} tickets created`);

console.log("\n✅ Website Project template seeded with " + count + " tickets (including 2 new process steps)");
console.log("   → SEO Redirect & Migration Strategy (Kick Off, sort 9, days 5-8)");
console.log("   → Design to Dev Handoff Meeting (Wireframe, sort 14, day 39)");
