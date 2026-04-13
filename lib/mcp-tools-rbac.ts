import type { RoleLevel } from "./permissions";

const ROLE_TIER: Record<RoleLevel, number> = {
  owner: 50,
  c_suite: 40,
  bookkeeper: 30,
  employee: 20,
  intern: 10,
};

/**
 * Minimum role level required to call each MCP tool.
 * Anything not listed defaults to "employee".
 */
const TOOL_MIN_ROLE: Record<string, RoleLevel> = {
  // Finance — owner / c_suite only
  stripe_get_balance: "c_suite",
  stripe_list_invoices: "c_suite",

  // Ops data — open to all team members
  list_connections: "employee",

  // Sync / ETL management — open to all team members
  list_destinations: "employee",
  list_syncs: "employee",
  create_sync: "employee",
  run_sync_now: "employee",
  pause_sync: "employee",
  resume_sync: "employee",
  delete_sync: "employee",

  // Everything else (portal reads, marketing) — employee default
};

export function isToolAllowed(toolName: string, role: RoleLevel | null): boolean {
  // Legacy shared-token callers (role = null) get full access.
  if (role === null) return true;

  const min = TOOL_MIN_ROLE[toolName] ?? "employee";
  return ROLE_TIER[role] >= ROLE_TIER[min];
}
