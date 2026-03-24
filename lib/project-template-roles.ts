import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { ProjectTemplateRole } from "@/types";

function docToRole(doc: any): ProjectTemplateRole {
  return {
    id: doc._id,
    projectId: doc.projectId,
    name: doc.name ?? "",
    sortOrder: doc.sortOrder ?? 0,
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
  };
}

export async function getTemplateRoles(projectId: string): Promise<ProjectTemplateRole[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.projectTemplateRoles.listByProject, { projectId: projectId as any });
  // Sort by sortOrder then by creation time
  const sorted = [...docs].sort((a: any, b: any) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (a._creationTime ?? 0) - (b._creationTime ?? 0);
  });
  return sorted.map(docToRole);
}

export async function createTemplateRole(
  projectId: string,
  name: string,
  sortOrder?: number
): Promise<ProjectTemplateRole> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.projectTemplateRoles.create, {
    projectId: projectId as any,
    name,
    sortOrder: sortOrder ?? 0,
  });
  return docToRole(doc);
}

export async function updateTemplateRole(
  id: string,
  data: { name?: string; sortOrder?: number }
): Promise<ProjectTemplateRole | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.projectTemplateRoles.update, {
    id: id as any,
    name: data.name,
    sortOrder: data.sortOrder,
  } as any);
  if (!doc) return null;
  return docToRole(doc);
}

export async function deleteTemplateRole(id: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.projectTemplateRoles.remove, { id: id as any });
  return true;
}

export async function reorderTemplateRoles(
  projectId: string,
  orderedIds: string[]
): Promise<void> {
  const convex = getConvexClient();
  // Reorder by updating each role's sortOrder individually
  for (let i = 0; i < orderedIds.length; i++) {
    await convex.mutation(api.projectTemplateRoles.update, {
      id: orderedIds[i] as any,
      sortOrder: i,
    } as any);
  }
}
