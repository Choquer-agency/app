import { sql } from "@vercel/postgres";
import { ClientPackage, PackageCategory } from "@/types";

function rowToClientPackage(row: Record<string, unknown>): ClientPackage {
  return {
    id: row.id as number,
    clientId: row.client_id as number,
    packageId: row.package_id as number,
    customPrice: row.custom_price ? parseFloat(row.custom_price as string) : null,
    customHours: row.custom_hours ? parseFloat(row.custom_hours as string) : null,
    signupDate: row.signup_date
      ? (row.signup_date as Date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    contractEndDate: row.contract_end_date
      ? (row.contract_end_date as Date).toISOString().split("T")[0]
      : null,
    active: row.active as boolean,
    notes: (row.notes as string) || "",
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
    // Joined fields
    packageName: (row.package_name as string) || undefined,
    packageDefaultPrice: row.package_default_price
      ? parseFloat(row.package_default_price as string)
      : undefined,
    packageCategory: ((row.package_category as string) || "other") as PackageCategory,
    packageHoursIncluded: row.package_hours_included
      ? parseFloat(row.package_hours_included as string)
      : null,
  };
}

// Recalculate and update clients.mrr from active package assignments
export async function syncClientMrr(clientId: number): Promise<void> {
  await sql`
    UPDATE clients SET
      mrr = COALESCE((
        SELECT SUM(COALESCE(cp.custom_price, p.default_price))
        FROM client_packages cp
        JOIN packages p ON p.id = cp.package_id
        WHERE cp.client_id = ${clientId} AND cp.active = true
      ), 0),
      updated_at = NOW()
    WHERE id = ${clientId}
  `;
}

export async function getClientPackages(clientId: number): Promise<ClientPackage[]> {
  const { rows } = await sql`
    SELECT cp.*, p.name AS package_name, p.default_price AS package_default_price,
      p.category AS package_category, p.hours_included AS package_hours_included
    FROM client_packages cp
    JOIN packages p ON p.id = cp.package_id
    WHERE cp.client_id = ${clientId}
    ORDER BY cp.active DESC, cp.signup_date DESC
  `;
  return rows.map(rowToClientPackage);
}

export async function assignPackage(data: {
  clientId: number;
  packageId: number;
  customPrice?: number | null;
  customHours?: number | null;
  signupDate?: string;
  contractEndDate?: string | null;
  notes?: string;
}): Promise<ClientPackage> {
  try {
    const { rows } = await sql`
      INSERT INTO client_packages (client_id, package_id, custom_price, custom_hours, signup_date, contract_end_date, notes)
      VALUES (
        ${data.clientId},
        ${data.packageId},
        ${data.customPrice ?? null},
        ${data.customHours ?? null},
        ${data.signupDate || new Date().toISOString().split("T")[0]},
        ${data.contractEndDate || null},
        ${data.notes || ""}
      )
      RETURNING *
    `;
    return rowToClientPackage(rows[0]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      await sql`ALTER TABLE client_packages DROP CONSTRAINT IF EXISTS client_packages_client_id_package_id_key`;
      const { rows } = await sql`
        INSERT INTO client_packages (client_id, package_id, custom_price, custom_hours, signup_date, contract_end_date, notes)
        VALUES (
          ${data.clientId},
          ${data.packageId},
          ${data.customPrice ?? null},
          ${data.customHours ?? null},
          ${data.signupDate || new Date().toISOString().split("T")[0]},
          ${data.contractEndDate || null},
          ${data.notes || ""}
        )
        RETURNING *
      `;
      return rowToClientPackage(rows[0]);
    }
    throw error;
  }
}

export async function updateAssignment(
  id: number,
  data: {
    customPrice?: number | null;
    signupDate?: string;
    contractEndDate?: string | null;
    active?: boolean;
    notes?: string;
  }
): Promise<ClientPackage | null> {
  const existing = await sql`SELECT * FROM client_packages WHERE id = ${id}`;
  if (existing.rows.length === 0) return null;

  const current = existing.rows[0];
  const customPrice = data.customPrice !== undefined ? data.customPrice : current.custom_price;
  const signupDate = data.signupDate ?? current.signup_date;
  const contractEndDate = data.contractEndDate !== undefined ? data.contractEndDate : current.contract_end_date;
  const active = data.active ?? current.active;
  const notes = data.notes ?? current.notes;

  const { rows } = await sql`
    UPDATE client_packages SET
      custom_price = ${customPrice},
      signup_date = ${signupDate},
      contract_end_date = ${contractEndDate},
      active = ${active},
      notes = ${notes},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToClientPackage(rows[0]);
}

export async function removeAssignment(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM client_packages WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}
