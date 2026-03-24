import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { SavedView, CreateSavedViewInput, TicketFilters } from "@/types";

// === Doc Mapper ===

function docToSavedView(doc: any): SavedView {
  return {
    id: doc._id,
    teamMemberId: doc.teamMemberId,
    name: doc.name ?? "",
    filters: (doc.filters as TicketFilters) ?? {},
    isDefault: doc.isDefault ?? false,
    sortOrder: doc.sortOrder ?? 0,
    createdAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
    updatedAt: doc._creationTime
      ? new Date(doc._creationTime).toISOString()
      : "",
  };
}

export async function getSavedViews(teamMemberId: number | string): Promise<SavedView[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.savedViews.listByMember, {
    teamMemberId: teamMemberId as any,
  });
  return docs
    .map(docToSavedView)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createSavedView(
  teamMemberId: number | string,
  data: CreateSavedViewInput
): Promise<SavedView> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.savedViews.create, {
    teamMemberId: teamMemberId as any,
    name: data.name,
    filters: data.filters,
    isDefault: data.isDefault ?? false,
    sortOrder: 0,
  });
  return docToSavedView(doc);
}

export async function updateSavedView(
  id: number | string,
  teamMemberId: number | string,
  data: Partial<CreateSavedViewInput & { sortOrder: number }>
): Promise<SavedView | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.savedViews.update, {
    id: id as any,
    name: data.name,
    filters: data.filters,
    isDefault: data.isDefault,
    sortOrder: data.sortOrder,
  });
  if (!doc) return null;
  return docToSavedView(doc);
}

export async function deleteSavedView(
  id: number | string,
  teamMemberId: number | string
): Promise<boolean> {
  const convex = getConvexClient();
  try {
    await convex.mutation(api.savedViews.remove, { id: id as any });
    return true;
  } catch {
    return false;
  }
}
