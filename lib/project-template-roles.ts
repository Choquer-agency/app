import { sql } from "@vercel/postgres";
import { ProjectTemplateRole } from "@/types";

function rowToRole(row: Record<string, unknown>): ProjectTemplateRole {
  return {
    id: row.id as number,
    projectId: row.project_id as number,
    name: row.name as string,
    sortOrder: (row.sort_order as number) || 0,
    createdAt: (row.created_at as Date)?.toISOString(),
  };
}

export async function getTemplateRoles(projectId: number): Promise<ProjectTemplateRole[]> {
  const { rows } = await sql`
    SELECT * FROM project_template_roles
    WHERE project_id = ${projectId}
    ORDER BY sort_order ASC, id ASC
  `;
  return rows.map(rowToRole);
}

export async function createTemplateRole(
  projectId: number,
  name: string,
  sortOrder?: number
): Promise<ProjectTemplateRole> {
  const order = sortOrder ?? 0;
  const { rows } = await sql`
    INSERT INTO project_template_roles (project_id, name, sort_order)
    VALUES (${projectId}, ${name}, ${order})
    RETURNING *
  `;
  return rowToRole(rows[0]);
}

export async function updateTemplateRole(
  id: number,
  data: { name?: string; sortOrder?: number }
): Promise<ProjectTemplateRole | null> {
  const { rows: current } = await sql`SELECT * FROM project_template_roles WHERE id = ${id}`;
  if (current.length === 0) return null;

  const name = data.name ?? current[0].name;
  const sortOrder = data.sortOrder ?? current[0].sort_order;

  const { rows } = await sql`
    UPDATE project_template_roles
    SET name = ${name}, sort_order = ${sortOrder}
    WHERE id = ${id}
    RETURNING *
  `;
  return rowToRole(rows[0]);
}

export async function deleteTemplateRole(id: number): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM project_template_roles WHERE id = ${id}`;
  return (rowCount ?? 0) > 0;
}

export async function reorderTemplateRoles(
  projectId: number,
  orderedIds: number[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await sql`
      UPDATE project_template_roles SET sort_order = ${i}
      WHERE id = ${orderedIds[i]} AND project_id = ${projectId}
    `;
  }
}
