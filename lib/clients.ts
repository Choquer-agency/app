import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { ClientConfig, CreateClientInput } from "@/types";

export function docToClient(doc: any): ClientConfig {
  return {
    id: doc._id,
    name: doc.name ?? "",
    slug: doc.slug ?? "",
    ga4PropertyId: doc.ga4PropertyId ?? "",
    gscSiteUrl: doc.gscSiteUrl ?? "",
    seRankingsProjectId: doc.seRankingsProjectId ?? "",
    calLink: doc.calLink ?? "",
    notionPageUrl: doc.notionPageUrl ?? "",
    notionPageId: doc.notionPageId ?? "",
    active: doc.active ?? true,
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
    updatedAt: undefined,
    websiteUrl: doc.websiteUrl ?? "",
    contactName: doc.contactName ?? "",
    contactEmail: doc.contactEmail ?? "",
    contactPhone: doc.contactPhone ?? "",
    contractStartDate: doc.contractStartDate ?? null,
    contractEndDate: doc.contractEndDate ?? null,
    mrr: doc.mrr ?? 0,
    country: (doc.country ?? "CA") as "CA" | "US",
    accountSpecialist: doc.accountSpecialist ?? "",
    seoHoursAllocated: doc.seoHoursAllocated ?? 0,
    addressLine1: doc.addressLine1 ?? "",
    addressLine2: doc.addressLine2 ?? "",
    city: doc.city ?? "",
    provinceState: doc.provinceState ?? "",
    postalCode: doc.postalCode ?? "",
    clientStatus: (doc.clientStatus ?? "active") as ClientConfig["clientStatus"],
    offboardingDate: doc.offboardingDate ?? null,
    industry: doc.industry ?? "",
    tags: doc.tags ?? [],
    lastContactDate: doc.lastContactDate ?? null,
    nextReviewDate: doc.nextReviewDate ?? null,
    socialLinkedin: doc.socialLinkedin ?? "",
    socialFacebook: doc.socialFacebook ?? "",
    socialInstagram: doc.socialInstagram ?? "",
    socialX: doc.socialX ?? "",
  };
}

export async function getClientById(id: string): Promise<ClientConfig | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.clients.getById, { id: id as any });
  if (!doc) return null;
  return docToClient(doc);
}

export async function getActiveClients(): Promise<ClientConfig[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.clients.list, {});
  return docs.map(docToClient);
}

export async function getClientBySlug(slug: string): Promise<ClientConfig | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.clients.getBySlug, { slug });
  if (!doc) return null;
  return docToClient(doc);
}

export async function getAllClients(): Promise<ClientConfig[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.clients.list, {});
  return docs.map(docToClient);
}

export async function getPastClients(): Promise<ClientConfig[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.clients.getPastClients, {});
  return docs.map(docToClient);
}

export async function createClient(data: CreateClientInput): Promise<ClientConfig> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.clients.create, {
    name: data.name,
    ga4PropertyId: data.ga4PropertyId,
    gscSiteUrl: data.gscSiteUrl,
    seRankingsProjectId: data.seRankingsProjectId,
    calLink: data.calLink,
    notionPageUrl: data.notionPageUrl,
    active: data.active,
    websiteUrl: data.websiteUrl,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    contractStartDate: data.contractStartDate,
    contractEndDate: data.contractEndDate,
    mrr: data.mrr,
    country: data.country,
    seoHoursAllocated: data.seoHoursAllocated,
    accountSpecialist: data.accountSpecialist,
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2,
    city: data.city,
    provinceState: data.provinceState,
    postalCode: data.postalCode,
    clientStatus: data.clientStatus,
    offboardingDate: data.offboardingDate,
    industry: data.industry,
    tags: data.tags,
    lastContactDate: data.lastContactDate,
    nextReviewDate: data.nextReviewDate,
    socialLinkedin: data.socialLinkedin,
    socialFacebook: data.socialFacebook,
    socialInstagram: data.socialInstagram,
    socialX: data.socialX,
  });
  return docToClient(doc);
}

export async function updateClient(
  id: string,
  data: Partial<CreateClientInput>
): Promise<ClientConfig | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.clients.update, {
    id: id as any,
    ...data,
  } as any);
  if (!doc) return null;
  return docToClient(doc);
}

export async function deleteClient(id: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.clients.softDelete, { id: id as any });
  return true;
}

export async function hardDeleteClient(id: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.clients.hardDelete, { id: id as any });
  return true;
}
