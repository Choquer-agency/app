import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { ProjectGroup } from "@/types";

function docToGroup(doc: any): ProjectGroup {
  return {
    id: doc._id,
    projectId: doc.projectId,
    name: doc.name ?? "",
    color: doc.color ?? null,
    sortOrder: doc.sortOrder ?? 0,
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
  };
}

export async function getProjectGroups(projectId: string): Promise<ProjectGroup[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.projectGroups.listByProject, { projectId: projectId as any });
  // Sort by sortOrder then by creation time
  const sorted = [...docs].sort((a: any, b: any) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (a._creationTime ?? 0) - (b._creationTime ?? 0);
  });
  return sorted.map(docToGroup);
}

export async function createProjectGroup(
  projectId: string,
  name: string,
  color?: string,
  sortOrder?: number
): Promise<ProjectGroup> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.projectGroups.create, {
    projectId: projectId as any,
    name,
    color: color ?? undefined,
    sortOrder: sortOrder ?? 0,
  });
  return docToGroup(doc);
}

export async function updateProjectGroup(
  id: string,
  data: { name?: string; color?: string | null; sortOrder?: number }
): Promise<ProjectGroup | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.projectGroups.update, {
    id: id as any,
    name: data.name,
    color: data.color !== undefined ? (data.color ?? undefined) : undefined,
    sortOrder: data.sortOrder,
  } as any);
  if (!doc) return null;
  return docToGroup(doc);
}

export async function deleteProjectGroup(id: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.projectGroups.remove, { id: id as any });
  return true;
}

export async function reorderProjectGroups(
  projectId: string,
  orderedIds: string[]
): Promise<void> {
  const convex = getConvexClient();
  await convex.mutation(api.projectGroups.reorder, {
    projectId: projectId as any,
    orderedIds: orderedIds as any,
  });
}
