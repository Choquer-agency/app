// Central RBAC permissions — single source of truth for all access control.

export const ROLE_LEVELS = ["owner", "c_suite", "bookkeeper", "employee", "intern"] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];

// Numeric tier for comparisons (higher = more access).
// Non-contiguous to leave room for future roles.
const ROLE_TIER: Record<RoleLevel, number> = {
  owner: 50,
  c_suite: 40,
  bookkeeper: 30,
  employee: 20,
  intern: 10,
};

// Display labels for the UI
export const ROLE_LABELS: Record<RoleLevel, string> = {
  owner: "Owner",
  c_suite: "C-Suite",
  bookkeeper: "Bookkeeper",
  employee: "Employee",
  intern: "Intern",
};

export type Permission =
  // Navigation
  | "nav:home"
  | "nav:clients"
  | "nav:tickets"
  | "nav:reports"
  | "nav:settings"
  // Report tabs
  | "report:utilization"
  | "report:profitability"
  | "report:velocity"
  | "report:performance"
  | "report:revenue"
  | "report:forecasting"
  | "report:accountability"
  // Team management
  | "team:view"
  | "team:edit"
  | "team:view_wages"
  | "team:edit_wages"
  | "team:manage_roles"
  | "team:manage_passwords"
  // Leads
  | "nav:leads"
  // Clients
  | "clients:view"
  | "clients:edit"
  // Tickets
  | "tickets:view"
  | "tickets:edit"
  // Settings
  | "settings:view"
  | "settings:edit"
  // Time
  | "time:delete_entries"
  // Timesheet (payroll clock in/out)
  | "nav:timesheet"
  | "timesheet:clock_self"
  | "timesheet:view_own"
  | "timesheet:view_all"
  | "timesheet:manage"
  | "timesheet:export"
  | "timesheet:settings";

// Minimum role required for each permission.
// Any role at that tier or higher automatically gets access.
const PERMISSION_MAP: Record<Permission, RoleLevel> = {
  "nav:home": "intern",
  "nav:clients": "employee",
  "nav:tickets": "intern",
  "nav:reports": "employee",
  "nav:settings": "employee",

  "report:utilization": "employee",
  "report:profitability": "bookkeeper",
  "report:velocity": "employee",
  "report:performance": "employee",
  "report:revenue": "bookkeeper",
  "report:forecasting": "bookkeeper",
  "report:accountability": "bookkeeper",

  "team:view": "intern",
  "team:edit": "bookkeeper",
  "team:view_wages": "bookkeeper",
  "team:edit_wages": "owner",
  "team:manage_roles": "owner",
  "team:manage_passwords": "owner",

  "nav:leads": "owner",

  "clients:view": "employee",
  "clients:edit": "bookkeeper",

  "tickets:view": "intern",
  "tickets:edit": "intern",

  "settings:view": "employee",
  "settings:edit": "bookkeeper",

  "time:delete_entries": "owner",

  "nav:timesheet": "intern",
  "timesheet:clock_self": "intern",
  "timesheet:view_own": "intern",
  "timesheet:view_all": "bookkeeper",
  "timesheet:manage": "c_suite",
  "timesheet:export": "bookkeeper",
  "timesheet:settings": "owner",
};

/** Check if a role has a specific permission */
export function hasPermission(userRole: RoleLevel, permission: Permission): boolean {
  const requiredTier = ROLE_TIER[PERMISSION_MAP[permission]];
  const userTier = ROLE_TIER[userRole];
  return userTier >= requiredTier;
}

/** Check if a role meets a minimum role level */
export function hasMinRole(userRole: RoleLevel, minimumRole: RoleLevel): boolean {
  return ROLE_TIER[userRole] >= ROLE_TIER[minimumRole];
}

/** Validate a string is a known role level, with fallback */
export function validateRoleLevel(value: string | null | undefined): RoleLevel {
  if (value && (ROLE_LEVELS as readonly string[]).includes(value)) {
    return value as RoleLevel;
  }
  // Legacy mapping
  if (value === "admin") return "owner";
  return "employee";
}
