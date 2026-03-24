import { sql } from "@vercel/postgres";
import { ProjectGroup } from "@/types";

function rowToGroup(row: Record<string, unknown>): ProjectGroup {
  return {
    id: row.id as number,
    projectId: row.project_id as number,
    name: row.name as string,
    color: (row.color as string) || null,
    sortOrder: (row.sort_order as number) || 0,
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

export async function getProjectGroups(projectId: number): Promise<ProjectGroup[]> {
  const { rows } = await sql`
    SELECT * FROM project_groups
    WHERE project_id = ${projectId}
    ORDER BY sort_order ASC, id ASC
  `;
  return rows.map(rowToGroup);
}

export async function createProjectGroup(
  projectId: number,
  name: string,
  color?: string,
  sortOrder?: number
): Promise<ProjectGroup> {
  const order = sortOrder ?? 0;
  const { rows } = await sql`
    INSERT INTO project_groups (project_id, name, color, sort_order)
    VALUES (${projectId}, ${name}, ${color ?? null}, ${order})
    RETURNING *
  `;
  return rowToGroup(rows[0]);
}

export async function updateProjectGroup(
  id: number,
  data: { name?: string; color?: string | null; sortOrder?: number }
): Promise<ProjectGroup | null> {
  const { rows: current } = await sql`SELECT * FROM project_groups WHERE id = ${id}`;
  if (current.length === 0) return null;

  const name = data.name ?? current[0].name;
  const color = data.color !== undefined ? data.color : current[0].color;
  const sortOrder = data.sortOrder ?? current[0].sort_order;

  const { rows } = await sql`
    UPDATE project_groups
    SET name = ${name}, color = ${color}, sort_order = ${sortOrder}
    WHERE id = ${id}
    RETURNING *
  `;
  return rowToGroup(rows[0]);
}

export async function deleteProjectGroup(id: number): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM project_groups WHERE id = ${id}`;
  return (rowCount ?? 0) > 0;
}

export async function reorderProjectGroups(
  projectId: number,
  orderedIds: number[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await sql`
      UPDATE project_groups SET sort_order = ${i}
      WHERE id = ${orderedIds[i]} AND project_id = ${projectId}
    `;
  }
}
