import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { Package, CreatePackageInput, PackageCategory, BillingFrequency } from "@/types";

function docToPackage(doc: any): Package {
  return {
    id: doc._id,
    name: doc.name ?? "",
    description: doc.description ?? "",
    defaultPrice: doc.defaultPrice ?? 0,
    category: (doc.category ?? "other") as PackageCategory,
    billingFrequency: (doc.billingFrequency ?? "monthly") as BillingFrequency,
    hoursIncluded: doc.hoursIncluded ?? null,
    includedServices: doc.includedServices ?? [],
    setupFee: doc.setupFee ?? 0,
    active: doc.active ?? true,
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
    updatedAt: undefined,
  };
}

export async function getAllPackages(): Promise<Package[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.packages.list, {});
  return docs.map(docToPackage).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActivePackages(): Promise<Package[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.packages.list, { activeOnly: true });
  return docs.map(docToPackage).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPackageById(id: string): Promise<Package | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.packages.getById, { id: id as any });
  if (!doc) return null;
  return docToPackage(doc);
}

export async function createPackage(data: CreatePackageInput): Promise<Package> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.packages.create, {
    name: data.name,
    description: data.description,
    defaultPrice: data.defaultPrice,
    category: data.category,
    billingFrequency: data.billingFrequency,
    hoursIncluded: data.hoursIncluded ?? undefined,
    includedServices: data.includedServices,
    setupFee: data.setupFee,
    active: data.active,
  });
  return docToPackage(doc);
}

export async function updatePackage(
  id: string,
  data: Partial<CreatePackageInput>
): Promise<Package | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.packages.update, {
    id: id as any,
    ...data,
    hoursIncluded: data.hoursIncluded ?? undefined,
  } as any);
  if (!doc) return null;
  return docToPackage(doc);
}

export async function deletePackage(id: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.packages.softDelete, { id: id as any });
  return true;
}
