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
    ga4PropertyId: (row.ga4_property_id as string) || "",
    gscSiteUrl: (row.gsc_site_url as string) || "",
    seRankingsProjectId: (row.se_rankings_project_id as string) || "",
    calLink: (row.cal_link as string) || "",
    notionPageUrl: (row.notion_page_url as string) || "",
    notionPageId: (row.notion_page_id as string) || "",
    active: row.active as boolean,
    createdAt: (row.created_at as Date)?.toISOString(),
    updatedAt: (row.updated_at as Date)?.toISOString(),
    // CRM fields
    websiteUrl: (row.website_url as string) || "",
    contactName: (row.contact_name as string) || "",
    contactEmail: (row.contact_email as string) || "",
    contactPhone: (row.contact_phone as string) || "",
    contractStartDate: row.contract_start_date
      ? (row.contract_start_date as Date).toISOString().split("T")[0]
      : null,
    contractEndDate: row.contract_end_date
      ? (row.contract_end_date as Date).toISOString().split("T")[0]
      : null,
    mrr: parseFloat((row.mrr as string) || "0"),
    country: ((row.country as string) || "CA") as "CA" | "US",
    accountSpecialist: (row.account_specialist as string) || "",
    seoHoursAllocated: parseFloat((row.seo_hours_allocated as string) || "0"),
    addressLine1: (row.address_line1 as string) || "",
    addressLine2: (row.address_line2 as string) || "",
    city: (row.city as string) || "",
    provinceState: (row.province_state as string) || "",
    postalCode: (row.postal_code as string) || "",
    clientStatus: ((row.client_status as string) || "active") as
      | "new"
      | "active"
      | "offboarding",
    offboardingDate: row.offboarding_date
      ? (row.offboarding_date as Date).toISOString().split("T")[0]
      : null,
    industry: (row.industry as string) || "",
    tags: (row.tags as string[]) || [],
    lastContactDate: row.last_contact_date
      ? (row.last_contact_date as Date).toISOString()
      : null,
    nextReviewDate: row.next_review_date
      ? (row.next_review_date as Date).toISOString().split("T")[0]
      : null,
    socialLinkedin: (row.social_linkedin as string) || "",
    socialFacebook: (row.social_facebook as string) || "",
    socialInstagram: (row.social_instagram as string) || "",
    socialX: (row.social_x as string) || "",
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
      ...DEFAULT_CRM_FIELDS,
    };
  });
}

// Default CRM fields for Notion fallback clients
const DEFAULT_CRM_FIELDS = {
  websiteUrl: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  contractStartDate: null,
  contractEndDate: null,
  mrr: 0,
  country: "CA" as const,
  accountSpecialist: "",
  seoHoursAllocated: 0,
  addressLine1: "",
  addressLine2: "",
  city: "",
  provinceState: "",
  postalCode: "",
  clientStatus: "active" as const,
  offboardingDate: null,
  industry: "",
  tags: [] as string[],
  lastContactDate: null,
  nextReviewDate: null,
  socialLinkedin: "",
  socialFacebook: "",
  socialInstagram: "",
  socialX: "",
};

// ─── Read Operations ──────────────────────────────────────────────────────────

export async function getClientById(
  id: number
): Promise<ClientConfig | null> {
  if (!HAS_POSTGRES) return null;
  const { rows } = await sql`
    SELECT * FROM clients WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToClient(rows[0]);
}

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
  const tagsLiteral = `{${(data.tags || []).map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`;

  const { rows } = await sql`
    INSERT INTO clients (
      name, slug, ga4_property_id, gsc_site_url, se_rankings_project_id, cal_link, notion_page_url, notion_page_id, active,
      website_url, contact_name, contact_email, contact_phone,
      contract_start_date, contract_end_date, mrr, country, seo_hours_allocated,
      account_specialist, address_line1, address_line2, city, province_state, postal_code,
      client_status, offboarding_date, industry, tags, last_contact_date, next_review_date,
      social_linkedin, social_facebook, social_instagram, social_x
    )
    VALUES (
      ${data.name}, ${slug}, ${ga4PropertyId}, ${gscSiteUrl}, ${data.seRankingsProjectId || ""},
      ${data.calLink}, ${data.notionPageUrl}, ${notionPageId}, ${data.active},
      ${data.websiteUrl || ""}, ${data.contactName || ""}, ${data.contactEmail || ""}, ${data.contactPhone || ""},
      ${data.contractStartDate || null}, ${data.contractEndDate || null},
      ${data.mrr || 0}, ${data.country || "CA"}, ${data.seoHoursAllocated || 0},
      ${data.accountSpecialist || ""}, ${data.addressLine1 || ""}, ${data.addressLine2 || ""},
      ${data.city || ""}, ${data.provinceState || ""}, ${data.postalCode || ""},
      ${data.clientStatus || "active"}, ${data.offboardingDate || null}, ${data.industry || ""}, ${tagsLiteral}::text[],
      ${data.lastContactDate || null}, ${data.nextReviewDate || null},
      ${data.socialLinkedin || ""}, ${data.socialFacebook || ""}, ${data.socialInstagram || ""}, ${data.socialX || ""}
    )
    RETURNING *
  `;
  return rowToClient(rows[0]);
}

export async function updateClient(
  id: number,
  data: Partial<CreateClientInput>
): Promise<ClientConfig | null> {
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
  const seRankingsProjectId = data.seRankingsProjectId ?? current.se_rankings_project_id ?? "";
  const calLink = data.calLink ?? current.cal_link;
  const active = data.active ?? current.active;

  // CRM fields
  const websiteUrl = data.websiteUrl ?? current.website_url ?? "";
  const contactName = data.contactName ?? current.contact_name ?? "";
  const contactEmail = data.contactEmail ?? current.contact_email ?? "";
  const contactPhone = data.contactPhone ?? current.contact_phone ?? "";
  const contractStartDate = (data.contractStartDate || null) ?? current.contract_start_date ?? null;
  const contractEndDate = (data.contractEndDate || null) ?? current.contract_end_date ?? null;
  const mrr = data.mrr ?? parseFloat(current.mrr || "0");
  const country = data.country ?? current.country ?? "CA";
  const seoHoursAllocated = data.seoHoursAllocated ?? parseFloat(current.seo_hours_allocated || "0");
  const accountSpecialist = data.accountSpecialist ?? current.account_specialist ?? "";
  const addressLine1 = data.addressLine1 ?? current.address_line1 ?? "";
  const addressLine2 = data.addressLine2 ?? current.address_line2 ?? "";
  const city = data.city ?? current.city ?? "";
  const provinceState = data.provinceState ?? current.province_state ?? "";
  const postalCode = data.postalCode ?? current.postal_code ?? "";
  const clientStatus = data.clientStatus ?? current.client_status ?? "active";
  const offboardingDate = data.offboardingDate !== undefined ? (data.offboardingDate || null) : current.offboarding_date ?? null;
  const industry = data.industry ?? current.industry ?? "";
  const tagsArr = data.tags ?? current.tags ?? [];
  const tagsLiteral = `{${(tagsArr as string[]).map((t: string) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`;
  const lastContactDate = (data.lastContactDate || null) ?? current.last_contact_date ?? null;
  const nextReviewDate = (data.nextReviewDate || null) ?? current.next_review_date ?? null;
  const socialLinkedin = data.socialLinkedin ?? current.social_linkedin ?? "";
  const socialFacebook = data.socialFacebook ?? current.social_facebook ?? "";
  const socialInstagram = data.socialInstagram ?? current.social_instagram ?? "";
  const socialX = data.socialX ?? current.social_x ?? "";

  const { rows } = await sql`
    UPDATE clients SET
      name = ${name},
      slug = ${slug},
      ga4_property_id = ${ga4PropertyId},
      gsc_site_url = ${gscSiteUrl},
      se_rankings_project_id = ${seRankingsProjectId},
      cal_link = ${calLink},
      notion_page_url = ${notionPageUrl},
      notion_page_id = ${notionPageId},
      active = ${active},
      website_url = ${websiteUrl},
      contact_name = ${contactName},
      contact_email = ${contactEmail},
      contact_phone = ${contactPhone},
      contract_start_date = ${contractStartDate},
      contract_end_date = ${contractEndDate},
      mrr = ${mrr},
      country = ${country},
      seo_hours_allocated = ${seoHoursAllocated},
      account_specialist = ${accountSpecialist},
      address_line1 = ${addressLine1},
      address_line2 = ${addressLine2},
      city = ${city},
      province_state = ${provinceState},
      postal_code = ${postalCode},
      client_status = ${clientStatus},
      offboarding_date = ${offboardingDate},
      industry = ${industry},
      tags = ${tagsLiteral}::text[],
      last_contact_date = ${lastContactDate},
      next_review_date = ${nextReviewDate},
      social_linkedin = ${socialLinkedin},
      social_facebook = ${socialFacebook},
      social_instagram = ${socialInstagram},
      social_x = ${socialX},
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
