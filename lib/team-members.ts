import { sql } from "@vercel/postgres";
import { TeamMember } from "@/types";

function rowToTeamMember(row: Record<string, unknown>): TeamMember {
  return {
    id: row.id as number,
    name: row.name as string,
    email: (row.email as string) || "",
    role: (row.role as string) || "",
    calLink: (row.cal_link as string) || "",
    profilePicUrl: (row.profile_pic_url as string) || "",
    active: row.active as boolean,
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const { rows } = await sql`
    SELECT * FROM team_members WHERE active = true ORDER BY name
  `;
  return rows.map(rowToTeamMember);
}

export async function getAllTeamMembers(): Promise<TeamMember[]> {
  const { rows } = await sql`
    SELECT * FROM team_members ORDER BY active DESC, name
  `;
  return rows.map(rowToTeamMember);
}

export async function addTeamMember(data: {
  name: string;
  email: string;
  role?: string;
  calLink?: string;
  profilePicUrl?: string;
}): Promise<TeamMember> {
  const { rows } = await sql`
    INSERT INTO team_members (name, email, role, cal_link, profile_pic_url)
    VALUES (${data.name}, ${data.email}, ${data.role || ""}, ${data.calLink || ""}, ${data.profilePicUrl || ""})
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
  data: { name?: string; email?: string; role?: string; calLink?: string; profilePicUrl?: string; active?: boolean }
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
      active = ${data.active ?? current.active}
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToTeamMember(rows[0]);
}
