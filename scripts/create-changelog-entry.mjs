#!/usr/bin/env node

/**
 * Reads the last git commit and creates a changelog entry in Convex.
 * Called automatically by the Claude Code PostToolUse hook after git commits.
 * Runs silently — errors are swallowed so they never block the user.
 */

import { execSync } from "child_process";

const PROJECT_DIR = new URL("..", import.meta.url).pathname;

try {
  // Get last commit message and diff stats
  const message = execSync("git log -1 --pretty=%B", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim();
  const diffStat = execSync("git diff HEAD~1 --stat --no-color 2>/dev/null || echo ''", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim();

  // Skip merge commits, version bumps, and trivial commits
  if (/^merge/i.test(message) || /^v?\d+\.\d+/i.test(message) || message.length < 10) {
    process.exit(0);
  }

  // Skip commits that are only config/dependency changes
  const changedFiles = execSync("git diff HEAD~1 --name-only 2>/dev/null || echo ''", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim();
  const files = changedFiles.split("\n").filter(Boolean);
  const onlyConfig = files.every(f =>
    f === "package.json" || f === "package-lock.json" || f.startsWith(".") || f === "tsconfig.json"
  );
  if (onlyConfig && files.length > 0) {
    process.exit(0);
  }

  // Categorize based on commit message and changed files
  let category = "feature";
  const msgLower = message.toLowerCase();

  if (/\bfix(es|ed)?\b|\bbug\b|\bpatch\b|\bhotfix\b/.test(msgLower)) {
    category = "fix";
  } else if (/\bmov(e|ed|ing)\b|\brenam(e|ed|ing)\b|\brelocat/.test(msgLower)) {
    category = "moved";
  } else if (/\bdesign\b|\bstyl(e|ing)\b|\bui\b|\blayout\b|\btheme\b|\bcss\b/.test(msgLower)) {
    category = "design";
  } else if (/\bimprov(e|ed|ement)\b|\brefactor\b|\bupdat(e|ed|ing)\b|\benhance\b|\boptimiz/.test(msgLower)) {
    category = "improvement";
  } else if (/\badd(s|ed|ing)?\b|\bnew\b|\bcreate\b|\bbuild\b|\bimplement/.test(msgLower)) {
    category = "feature";
  }

  // Extract title: first line of commit, strip Co-Authored-By and conventional commit prefix
  let title = message.split("\n")[0]
    .replace(/^(feat|fix|chore|refactor|style|docs|test|ci|build)(\(.*?\))?:\s*/i, "")
    .trim();

  // Cap title length
  if (title.length > 80) {
    title = title.substring(0, 77) + "...";
  }

  // Build description from remaining commit lines or the diff stat summary
  const bodyLines = message.split("\n").slice(1).filter(l => l.trim() && !l.includes("Co-Authored-By"));
  let description = bodyLines.join(" ").trim();
  if (!description) {
    // Summarize from diff stat
    const fileCount = files.length;
    const hasNewFiles = diffStat.includes("create mode") || files.some(f => f.includes("new"));
    description = `Updated ${fileCount} file${fileCount !== 1 ? "s" : ""}${hasNewFiles ? " with new additions" : ""}.`;
  }
  if (description.length > 200) {
    description = description.substring(0, 197) + "...";
  }

  // Call Convex mutation
  const args = JSON.stringify({ title, description, category, authorName: "Bryce" });
  execSync(`npx convex run changelog:create '${args.replace(/'/g, "'\\''")}'`, {
    cwd: PROJECT_DIR,
    encoding: "utf-8",
    timeout: 15000,
    stdio: "ignore",
  });

} catch {
  // Silent failure — never block the user
  process.exit(0);
}
