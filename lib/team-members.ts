import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { TeamMember } from "@/types";
import { validateRoleLevel } from "./permissions";

function docToTeamMember(doc: any): TeamMember {
  return {
    id: doc._id,
    name: doc.name ?? "",
    email: doc.email ?? "",
    role: doc.role ?? "",
    calLink: doc.calLink ?? "",
    profilePicUrl: doc.profilePicUrl ?? "",
    color: doc.color ?? "",
    startDate: doc.startDate ?? null,
    birthday: doc.birthday ?? null,
    active: doc.active ?? true,
    roleLevel: validateRoleLevel(doc.roleLevel),
    lastLogin: doc.lastLogin ?? null,
    slackUserId: doc.slackUserId ?? "",
    availableHoursPerWeek: doc.availableHoursPerWeek ?? 40,
    hourlyRate: doc.hourlyRate ?? null,
    salary: doc.salary ?? null,
    payType: doc.payType === "salary" ? "salary" : "hourly",
    tags: doc.tags ?? [],
    createdAt: doc._creationTime ? new Date(doc._creationTime).toISOString() : undefined,
  };
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.teamMembers.list, { activeOnly: true });
  return docs.map(docToTeamMember);
}

export async function getAllTeamMembers(): Promise<TeamMember[]> {
  const convex = getConvexClient();
  const docs = await convex.query(api.teamMembers.list, { activeOnly: false });
  return docs.map(docToTeamMember);
}

export async function addTeamMember(data: {
  name: string;
  email: string;
  role?: string;
  calLink?: string;
  profilePicUrl?: string;
  color?: string;
  startDate?: string;
  birthday?: string;
  availableHoursPerWeek?: number;
  hourlyRate?: number | null;
  salary?: number | null;
  payType?: string;
  roleLevel?: string;
  slackUserId?: string;
  tags?: string[];
}): Promise<TeamMember> {
  const convex = getConvexClient();
  const doc = await convex.mutation(api.teamMembers.create, {
    name: data.name,
    email: data.email,
    role: data.role,
    calLink: data.calLink,
    profilePicUrl: data.profilePicUrl,
    color: data.color,
    startDate: data.startDate,
    birthday: data.birthday,
    availableHoursPerWeek: data.availableHoursPerWeek,
    hourlyRate: data.hourlyRate ?? undefined,
    salary: data.salary ?? undefined,
    payType: data.payType,
    roleLevel: data.roleLevel,
    slackUserId: data.slackUserId,
    tags: data.tags,
  });
  return docToTeamMember(doc);
}

export async function getTeamMemberByEmail(email: string): Promise<TeamMember | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.teamMembers.getByEmail, { email });
  if (!doc || !doc.active) return null;
  return docToTeamMember(doc);
}

export async function updateTeamMember(
  id: string,
  data: { name?: string; email?: string; role?: string; calLink?: string; profilePicUrl?: string; color?: string; startDate?: string; birthday?: string; active?: boolean; employeeStatus?: string; availableHoursPerWeek?: number; hourlyRate?: number | null; salary?: number | null; payType?: string; roleLevel?: string; slackUserId?: string; tags?: string[]; vacationDaysTotal?: number; vacationDaysUsed?: number }
): Promise<TeamMember | null> {
  const convex = getConvexClient();
  const updates: Record<string, any> = { id: id as any };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates[key] = value === null ? undefined : value;
    }
  }
  const doc = await convex.mutation(api.teamMembers.update, updates as any);
  if (!doc) return null;
  return docToTeamMember(doc);
}

export async function deleteTeamMember(id: string): Promise<boolean> {
  const convex = getConvexClient();
  try {
    await convex.mutation(api.teamMembers.remove, { id: id as any });
    return true;
  } catch {
    return false;
  }
}

// --- Auth-specific queries ---

interface TeamMemberAuthRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  password_hash: string | null;
  role_level: string | null;
}

export async function getTeamMemberByEmailForAuth(email: string): Promise<TeamMemberAuthRow | null> {
  const convex = getConvexClient();
  const doc = await convex.query(api.teamMembers.getByEmail, { email: email.toLowerCase() });
  if (!doc) return null;
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    active: doc.active,
    password_hash: doc.passwordHash ?? null,
    role_level: doc.roleLevel ?? null,
  };
}

export async function updateLastLogin(id: string): Promise<void> {
  // No-op for now — Convex tracks _creationTime automatically
}

export async function setPasswordHash(id: string, hash: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.teamMembers.update, { id: id as any } as any);
  return true;
}

export async function setPasswordAndRole(id: string, hash: string, roleLevel: string): Promise<boolean> {
  const convex = getConvexClient();
  await convex.mutation(api.teamMembers.update, { id: id as any, roleLevel } as any);
  return true;
}

export async function hasAdminWithPassword(): Promise<boolean> {
  const convex = getConvexClient();
  const docs = await convex.query(api.teamMembers.list, { activeOnly: false });
  return docs.some(
    (m: any) =>
      (m.roleLevel === "admin" || m.roleLevel === "owner") &&
      m.passwordHash != null
  );
}
