import { sql } from "@vercel/postgres";
import { TeamMember } from "@/types";
import { validateRoleLevel } from "./permissions";

function rowToTeamMember(row: Record<string, unknown>): TeamMember {
  return {
    id: row.id as number,
    name: row.name as string,
    email: (row.email as string) || "",
    role: (row.role as string) || "",
    calLink: (row.cal_link as string) || "",
    profilePicUrl: (row.profile_pic_url as string) || "",
    color: (row.color as string) || "",
    startDate: row.start_date ? (row.start_date as Date).toISOString().split("T")[0] : null,
    birthday: row.birthday ? (row.birthday as Date).toISOString().split("T")[0] : null,
    active: row.active as boolean,
    roleLevel: validateRoleLevel(row.role_level as string),
    lastLogin: row.last_login ? (row.last_login as Date).toISOString() : null,
    slackUserId: (row.slack_user_id as string) || "",
    availableHoursPerWeek: (row.available_hours_per_week as number) ?? 40,
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
    salary: row.salary != null ? Number(row.salary) : null,
    payType: (row.pay_type as string) === "salary" ? "salary" : "hourly",
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const { rows } = await sql`
    SELECT * FROM team_members WHERE active = true
    ORDER BY (LOWER(email) = 'bryce@choquer.agency') DESC, created_at ASC
  `;
  return rows.map(rowToTeamMember);
}

export async function getAllTeamMembers(): Promise<TeamMember[]> {
  const { rows } = await sql`
    SELECT * FROM team_members
    ORDER BY active DESC, (LOWER(email) = 'bryce@choquer.agency') DESC, created_at ASC
  `;
  return rows.map(rowToTeamMember);
}

export async function addTeamMember(data: {
  name: string;
  email: string;
  role?: string;
  calLink?: string;
  profilePicUrl?: string;
  color?: string;
  startDate?: string;
  birthday?: string;
  availableHoursPerWeek?: number;
  hourlyRate?: number | null;
  salary?: number | null;
  payType?: string;
  roleLevel?: string;
  slackUserId?: string;
  tags?: string[];
}): Promise<TeamMember> {
  const tagsArray = data.tags || [];
  const { rows } = await sql`
    INSERT INTO team_members (name, email, role, cal_link, profile_pic_url, color, start_date, birthday, available_hours_per_week, hourly_rate, salary, pay_type, role_level, slack_user_id, tags)
    VALUES (
      ${data.name}, ${data.email}, ${data.role || ""}, ${data.calLink || ""},
      ${data.profilePicUrl || ""}, ${data.color || ""},
      ${data.startDate || null}, ${data.birthday || null},
      ${data.availableHoursPerWeek ?? 40},
      ${data.hourlyRate ?? null}, ${data.salary ?? null},
      ${data.payType || "hourly"}, ${data.roleLevel || "employee"},
      ${data.slackUserId || ""},
      ${`{${tagsArray.map(t => `"${t}"`).join(",")}}`}::text[]
    )
    RETURNING *
  `;
  return rowToTeamMember(rows[0]);
}

export async function getTeamMemberByEmail(email: string): Promise<TeamMember | null> {
  const { rows } = await sql`
    SELECT * FROM team_members WHERE LOWER(email) = LOWER(${email}) AND active = true LIMIT 1
  `;
  return rows.length > 0 ? rowToTeamMember(rows[0]) : null;
}

export async function updateTeamMember(
  id: number,
  data: { name?: string; email?: string; role?: string; calLink?: string; profilePicUrl?: string; color?: string; startDate?: string; birthday?: string; active?: boolean; availableHoursPerWeek?: number; hourlyRate?: number | null; salary?: number | null; payType?: string; roleLevel?: string; slackUserId?: string; tags?: string[] }
): Promise<TeamMember | null> {
  const existing = await sql`SELECT * FROM team_members WHERE id = ${id}`;
  if (existing.rows.length === 0) return null;

  const current = existing.rows[0];
  const { rows } = await sql`
    UPDATE team_members SET
      name = ${data.name ?? current.name},
      email = ${data.email ?? current.email},
      role = ${data.role ?? current.role},
      cal_link = ${data.calLink ?? current.cal_link ?? ""},
      profile_pic_url = ${data.profilePicUrl ?? current.profile_pic_url ?? ""},
      color = ${data.color ?? current.color ?? ""},
      start_date = ${data.startDate !== undefined ? (data.startDate || null) : current.start_date},
      birthday = ${data.birthday !== undefined ? (data.birthday || null) : current.birthday},
      active = ${data.active ?? current.active},
      available_hours_per_week = ${data.availableHoursPerWeek ?? current.available_hours_per_week ?? 40},
      hourly_rate = ${data.hourlyRate !== undefined ? data.hourlyRate : current.hourly_rate},
      salary = ${data.salary !== undefined ? data.salary : current.salary},
      pay_type = ${data.payType ?? current.pay_type ?? "hourly"},
      role_level = ${data.roleLevel ?? current.role_level ?? "employee"},
      slack_user_id = ${data.slackUserId !== undefined ? data.slackUserId : current.slack_user_id ?? ""},
      tags = ${data.tags !== undefined ? `{${data.tags.map(t => `"${t}"`).join(",")}}` : (current.tags || "{}")}::text[]
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToTeamMember(rows[0]);
}

// --- Auth-specific queries (internal use only) ---

interface TeamMemberAuthRow {
  id: number;
  name: string;
  email: string;
  active: boolean;
  password_hash: string | null;
  role_level: string | null;
}

/** Returns auth-relevant fields. Does NOT filter by active — login route needs to distinguish "no email" from "deactivated". */
export async function getTeamMemberByEmailForAuth(email: string): Promise<TeamMemberAuthRow | null> {
  const { rows } = await sql`
    SELECT id, name, email, active, password_hash, role_level
    FROM team_members
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as TeamMemberAuthRow) : null;
}

export async function updateLastLogin(id: number): Promise<void> {
  await sql`UPDATE team_members SET last_login = NOW() WHERE id = ${id}`;
}

export async function setPasswordHash(id: number, hash: string): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE team_members SET password_hash = ${hash} WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}

export async function setPasswordAndRole(id: number, hash: string, roleLevel: string): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE team_members SET password_hash = ${hash}, role_level = ${roleLevel} WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}

/** Check if any admin/owner with a password already exists (for setup endpoint self-destruct). */
export async function hasAdminWithPassword(): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM team_members
    WHERE role_level IN ('admin', 'owner') AND password_hash IS NOT NULL
    LIMIT 1
  `;
  return rows.length > 0;
}
