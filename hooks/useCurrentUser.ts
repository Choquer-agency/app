"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "./useSession";
import { docToTeamMember } from "@/lib/team-members";
import { TeamMember } from "@/types";

export function useCurrentUser(): {
  user: TeamMember | null;
  userId: string | null;
  roleLevel: string | null;
  isLoading: boolean;
} {
  const session = useSession();
  const doc = useQuery(
    api.teamMembers.getById,
    session ? { id: session.teamMemberId as Id<"teamMembers"> } : "skip"
  );

  if (!session) {
    return { user: null, userId: null, roleLevel: null, isLoading: false };
  }

  return {
    user: doc ? docToTeamMember(doc) : null,
    userId: session.teamMemberId,
    roleLevel: session.roleLevel,
    isLoading: doc === undefined,
  };
}
