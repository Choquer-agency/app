import { sql } from "@vercel/postgres";
import { SavedView, CreateSavedViewInput, TicketFilters } from "@/types";

function rowToSavedView(row: Record<string, unknown>): SavedView {
  return {
    id: row.id as number,
    teamMemberId: row.team_member_id as number,
    name: row.name as string,
    filters: (row.filters as TicketFilters) || {},
    isDefault: (row.is_default as boolean) || false,
    sortOrder: (row.sort_order as number) || 0,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
  };
}

export async function getSavedViews(teamMemberId: number): Promise<SavedView[]> {
  const { rows } = await sql`
    SELECT * FROM saved_views
    WHERE team_member_id = ${teamMemberId}
    ORDER BY sort_order ASC, created_at ASC
  `;
  return rows.map(rowToSavedView);
}

export async function createSavedView(
  teamMemberId: number,
  data: CreateSavedViewInput
): Promise<SavedView> {
  // If setting as default, unset other defaults first
  if (data.isDefault) {
    await sql`
      UPDATE saved_views SET is_default = false, updated_at = NOW()
      WHERE team_member_id = ${teamMemberId} AND is_default = true
    `;
  }

  const filtersJson = JSON.stringify(data.filters);
  const { rows } = await sql`
    INSERT INTO saved_views (team_member_id, name, filters, is_default)
    VALUES (${teamMemberId}, ${data.name}, ${filtersJson}::jsonb, ${data.isDefault || false})
    RETURNING *
  `;
  return rowToSavedView(rows[0]);
}

export async function updateSavedView(
  id: number,
  teamMemberId: number,
  data: Partial<CreateSavedViewInput & { sortOrder: number }>
): Promise<SavedView | null> {
  // Fetch current to merge
  const { rows: existing } = await sql`
    SELECT * FROM saved_views WHERE id = ${id} AND team_member_id = ${teamMemberId}
  `;
  if (existing.length === 0) return null;

  const current = rowToSavedView(existing[0]);
  const name = data.name ?? current.name;
  const filters = data.filters ?? current.filters;
  const isDefault = data.isDefault ?? current.isDefault;
  const sortOrder = data.sortOrder ?? current.sortOrder;

  // If setting as default, unset other defaults first
  if (isDefault && !current.isDefault) {
    await sql`
      UPDATE saved_views SET is_default = false, updated_at = NOW()
      WHERE team_member_id = ${teamMemberId} AND is_default = true AND id != ${id}
    `;
  }

  const filtersJson = JSON.stringify(filters);
  const { rows } = await sql`
    UPDATE saved_views SET
      name = ${name},
      filters = ${filtersJson}::jsonb,
      is_default = ${isDefault},
      sort_order = ${sortOrder},
      updated_at = NOW()
    WHERE id = ${id} AND team_member_id = ${teamMemberId}
    RETURNING *
  `;
  return rows.length > 0 ? rowToSavedView(rows[0]) : null;
}

export async function deleteSavedView(
  id: number,
  teamMemberId: number
): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM saved_views WHERE id = ${id} AND team_member_id = ${teamMemberId}
  `;
  return (rowCount ?? 0) > 0;
}
