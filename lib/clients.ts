import { sql } from "@vercel/postgres";
import { Client as NotionClient } from "@notionhq/client";
import { ClientConfig, CreateClientInput } from "@/types";

const HAS_POSTGRES = !!process.env.POSTGRES_URL;
const HAS_NOTION = !!process.env.NOTION_API_KEY;
const NOTION_CLIENTS_DB = "3272088a-49e1-807a-b3d7-dca871e5a1c6";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractNotionPageId(url: string): string {
  if (!url) return "";
  // Notion URLs: https://www.notion.so/Page-Title-abc123def456...
  // The last 32 hex chars (no dashes) are the page ID
  const match = url.match(/([a-f0-9]{32})(?:\?|$)/);
  if (match) return match[1];
  // Also handle URLs with dashes in the ID
  const dashMatch = url.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
  );
  if (dashMatch) return dashMatch[1].replace(/-/g, "");
  return "";
}

function normalizeGscUrl(url: string): string {
  if (!url) return "";
  let gscSiteUrl = url;
  if (!url.startsWith("sc-domain:") && !url.startsWith("http")) {
    gscSiteUrl = `sc-domain:${url}`;
  }
  if (gscSiteUrl.startsWith("http") && !gscSiteUrl.endsWith("/")) {
    gscSiteUrl += "/";
  }
  return gscSiteUrl;
}

function normalizeGa4Id(id: string): string {
  if (!id) return "";
  if (!id.startsWith("properties/")) {
    return `properties/${id}`;
  }
  return id;
}

function rowToClient(row: Record<string, unknown>): ClientConfig {
  return {
    id: row.id as number,
    name: row.name as string,
    slug: row.slug as string,
    ga4PropertyId: row.ga4_property_id as string,
    gscSiteUrl: row.gsc_site_url as string,
    seRankingsProjectId: row.se_rankings_project_id as string,
    calLink: row.cal_link as string,
    notionPageUrl: row.notion_page_url as string,
    notionPageId: row.notion_page_id as string,
    active: row.active as boolean,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
  };
}

// ─── Notion Fallback (when Postgres is not available) ────────────────────────

async function getClientsFromNotion(): Promise<ClientConfig[]> {
  if (!HAS_NOTION) return [];
  const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
  const res = await notion.databases.query({
    database_id: NOTION_CLIENTS_DB,
    filter: { property: "Active", checkbox: { equals: true } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any, i: number) => {
    const props = page.properties;
    const name = props.Client?.title?.map((t: { plain_text: string }) => t.plain_text).join("") || "";
    const slug = generateSlug(name);
    const gscUrl = props["Search Console"]?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("") || "";
    const ga4Id = props.GA4?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("") || "";
    const notionPageId = props["Notion Page ID"]?.formula?.string || "";
    const pageUrl = props.Page?.url || "";

    return {
      id: i,
      name,
      slug,
      ga4PropertyId: normalizeGa4Id(ga4Id),
      gscSiteUrl: normalizeGscUrl(gscUrl),
      seRankingsProjectId: "",
      calLink: "https://cal.com/andres-agudelo-hqlknm/15min",
      notionPageUrl: pageUrl,
      notionPageId,
      active: true,
    };
  });
}

// ─── Read Operations ──────────────────────────────────────────────────────────

export async function getActiveClients(): Promise<ClientConfig[]> {
  if (!HAS_POSTGRES) return getClientsFromNotion();
  const { rows } = await sql`
    SELECT * FROM clients WHERE active = true ORDER BY name
  `;
  return rows.map(rowToClient);
}

export async function getClientBySlug(
  slug: string
): Promise<ClientConfig | null> {
  if (!HAS_POSTGRES) {
    const clients = await getClientsFromNotion();
    return clients.find((c) => c.slug === slug) || null;
  }
  const { rows } = await sql`
    SELECT * FROM clients WHERE slug = ${slug} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToClient(rows[0]);
}

export async function getAllClients(): Promise<ClientConfig[]> {
  if (!HAS_POSTGRES) return getClientsFromNotion();
  const { rows } = await sql`
    SELECT * FROM clients ORDER BY active DESC, name
  `;
  return rows.map(rowToClient);
}

// ─── Write Operations ─────────────────────────────────────────────────────────

export async function createClient(
  data: CreateClientInput
): Promise<ClientConfig> {
  const slug = generateSlug(data.name);
  const notionPageId = extractNotionPageId(data.notionPageUrl);
  const gscSiteUrl = normalizeGscUrl(data.gscSiteUrl);
  const ga4PropertyId = normalizeGa4Id(data.ga4PropertyId);

  const { rows } = await sql`
    INSERT INTO clients (name, slug, ga4_property_id, gsc_site_url, cal_link, notion_page_url, notion_page_id, active)
    VALUES (
      ${data.name},
      ${slug},
      ${ga4PropertyId},
      ${gscSiteUrl},
      ${data.calLink},
      ${data.notionPageUrl},
      ${notionPageId},
      ${data.active}
    )
    RETURNING *
  `;
  return rowToClient(rows[0]);
}

export async function updateClient(
  id: number,
  data: Partial<CreateClientInput>
): Promise<ClientConfig | null> {
  // Build the update dynamically based on provided fields
  const existing = await sql`SELECT * FROM clients WHERE id = ${id}`;
  if (existing.rows.length === 0) return null;

  const current = existing.rows[0];
  const name = data.name ?? current.name;
  const slug = data.name ? generateSlug(data.name) : current.slug;
  const notionPageUrl = data.notionPageUrl ?? current.notion_page_url;
  const notionPageId = data.notionPageUrl
    ? extractNotionPageId(data.notionPageUrl)
    : current.notion_page_id;
  const gscSiteUrl =
    data.gscSiteUrl !== undefined
      ? normalizeGscUrl(data.gscSiteUrl)
      : current.gsc_site_url;
  const ga4PropertyId =
    data.ga4PropertyId !== undefined
      ? normalizeGa4Id(data.ga4PropertyId)
      : current.ga4_property_id;
  const calLink = data.calLink ?? current.cal_link;
  const active = data.active ?? current.active;

  const { rows } = await sql`
    UPDATE clients SET
      name = ${name},
      slug = ${slug},
      ga4_property_id = ${ga4PropertyId},
      gsc_site_url = ${gscSiteUrl},
      cal_link = ${calLink},
      notion_page_url = ${notionPageUrl},
      notion_page_id = ${notionPageId},
      active = ${active},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToClient(rows[0]);
}

export async function deleteClient(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE clients SET active = false, updated_at = NOW() WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}
