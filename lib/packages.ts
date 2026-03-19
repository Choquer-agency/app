import { sql } from "@vercel/postgres";
import { Package, CreatePackageInput, PackageCategory, BillingFrequency } from "@/types";

function rowToPackage(row: Record<string, unknown>): Package {
  return {
    id: row.id as number,
    name: row.name as string,
    description: (row.description as string) || "",
    defaultPrice: parseFloat((row.default_price as string) || "0"),
    category: ((row.category as string) || "other") as PackageCategory,
    billingFrequency: ((row.billing_frequency as string) || "monthly") as BillingFrequency,
    hoursIncluded: row.hours_included ? parseFloat(row.hours_included as string) : null,
    includedServices: (row.included_services as string[]) || [],
    active: row.active as boolean,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
  };
}

export async function getAllPackages(): Promise<Package[]> {
  const { rows } = await sql`
    SELECT * FROM packages ORDER BY active DESC, name
  `;
  return rows.map(rowToPackage);
}

export async function getActivePackages(): Promise<Package[]> {
  const { rows } = await sql`
    SELECT * FROM packages WHERE active = true ORDER BY name
  `;
  return rows.map(rowToPackage);
}

export async function getPackageById(id: number): Promise<Package | null> {
  const { rows } = await sql`
    SELECT * FROM packages WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToPackage(rows[0]);
}

function toArrayLiteral(arr: string[]): string {
  return `{${arr.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",")}}`;
}

export async function createPackage(data: CreatePackageInput): Promise<Package> {
  const servicesLiteral = toArrayLiteral(data.includedServices || []);
  const { rows } = await sql`
    INSERT INTO packages (name, description, default_price, category, billing_frequency, hours_included, included_services, active)
    VALUES (
      ${data.name},
      ${data.description || ""},
      ${data.defaultPrice},
      ${data.category || "other"},
      ${data.billingFrequency || "monthly"},
      ${data.hoursIncluded ?? null},
      ${servicesLiteral}::text[],
      ${data.active ?? true}
    )
    RETURNING *
  `;
  return rowToPackage(rows[0]);
}

export async function updatePackage(
  id: number,
  data: Partial<CreatePackageInput>
): Promise<Package | null> {
  const existing = await sql`SELECT * FROM packages WHERE id = ${id}`;
  if (existing.rows.length === 0) return null;

  const current = existing.rows[0];
  const name = data.name ?? current.name;
  const description = data.description ?? current.description;
  const defaultPrice = data.defaultPrice ?? current.default_price;
  const category = data.category ?? current.category ?? "other";
  const billingFrequency = data.billingFrequency ?? current.billing_frequency ?? "monthly";
  const hoursIncluded = data.hoursIncluded !== undefined ? data.hoursIncluded : current.hours_included;
  const includedServices = data.includedServices ?? current.included_services ?? [];
  const servicesLiteral = toArrayLiteral(includedServices as string[]);
  const active = data.active ?? current.active;

  const { rows } = await sql`
    UPDATE packages SET
      name = ${name},
      description = ${description},
      default_price = ${defaultPrice},
      category = ${category},
      billing_frequency = ${billingFrequency},
      hours_included = ${hoursIncluded ?? null},
      included_services = ${servicesLiteral}::text[],
      active = ${active},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToPackage(rows[0]);
}

export async function deletePackage(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE packages SET active = false, updated_at = NOW() WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}
