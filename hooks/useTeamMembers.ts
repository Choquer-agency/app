"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { docToTeamMember } from "@/lib/team-members";
import { TeamMember } from "@/types";

export function useTeamMembers(activeOnly = true): {
  teamMembers: TeamMember[];
  isLoading: boolean;
} {
  const docs = useQuery(api.teamMembers.list, { activeOnly });
  const teamMembers = useMemo(
    () => docs?.map(docToTeamMember) ?? [],
    [docs]
  );
  return { teamMembers, isLoading: docs === undefined };
}
