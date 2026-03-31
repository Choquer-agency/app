import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { ClientPackage, PackageCategory } from "@/types";

function docToClientPackage(doc: any): ClientPackage {
  return {
    id: doc._id,
    clientId: doc.clientId,
    packageId: doc.packageId,
    customPrice: doc.customPrice ?? null,
    customHours: doc.customHours ?? null,
    applySetupFee: doc.applySetupFee ?? false,
    customSetupFee: doc.customSetupFee ?? null,
    signupDate: doc.signupDate ?? new Date().toISOString().split("T")[0],
    contractEndDate: doc.contractEndDate ?? null,
    active: doc.active ?? true,
    notes: doc.notes ?? "",
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
    updatedAt: undefined,
    // Enriched fields from the Convex query
    packageName: doc.packageName,
    packageDefaultPrice: doc.packageDefaultPrice,
    packageCategory: (doc.packageCategory ?? "other") as PackageCategory,
    packageHoursIncluded: doc.packageHoursIncluded ?? null,
    packageSetupFee: doc.packageSetupFee,
  };
}

export async function syncClientMrr(clientId: string): Promise<void> {
  // MRR is synced automatically by the Convex mutation
}

export async function getClientPackages(clientId: string): Promise<ClientPackage[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.clientPackages.listByClient, { clientId: clientId as any });
  return docs.map(docToClientPackage);
}

export async function assignPackage(data: {
  clientId: string;
  packageId: string;
  customPrice?: number | null;
  customHours?: number | null;
  applySetupFee?: boolean;
  customSetupFee?: number | null;
  signupDate?: string;
  contractEndDate?: string | null;
  notes?: string;
}): Promise<ClientPackage> {
  const convex = getConvexClient();
  // Build args — only include customPrice/customHours if they have a real value
  // (Convex optional fields: pass value to store, omit to skip)
  const args: Record<string, unknown> = {
    clientId: data.clientId as any,
    packageId: data.packageId as any,
    applySetupFee: data.applySetupFee,
    signupDate: data.signupDate,
    notes: data.notes,
  };
  if (data.customPrice !== null && data.customPrice !== undefined) {
    args.customPrice = data.customPrice;
  }
  if (data.customHours !== null && data.customHours !== undefined) {
    args.customHours = data.customHours;
  }
  if (data.customSetupFee !== null && data.customSetupFee !== undefined) {
    args.customSetupFee = data.customSetupFee;
  }
  if (data.contractEndDate) {
    args.contractEndDate = data.contractEndDate;
  }
  const doc = await convex.mutation(api.clientPackages.create, args as any);
  return docToClientPackage(doc);
}

export async function updateAssignment(
  id: string,
  data: {
    customPrice?: number | null;
    applySetupFee?: boolean;
    customSetupFee?: number | null;
    signupDate?: string;
    contractEndDate?: string | null;
    active?: boolean;
    notes?: string;
  }
): Promise<ClientPackage | null> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.clientPackages.update, {
    id: id as any,
    customPrice: data.customPrice ?? undefined,
    applySetupFee: data.applySetupFee,
    customSetupFee: data.customSetupFee ?? undefined,
    signupDate: data.signupDate,
    contractEndDate: data.contractEndDate ?? undefined,
    active: data.active,
    notes: data.notes,
  } as any);
  if (!doc) return null;
  return docToClientPackage(doc);
}

export async function removeAssignment(id: string): Promise<boolean> {
  const convex = getConvexClient();
  return await convex.mutation(api.clientPackages.remove, { id: id as any });
}
