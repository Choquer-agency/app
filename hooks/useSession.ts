"use client";

import { useMemo } from "react";
import { RoleLevel, validateRoleLevel } from "@/lib/permissions";
import { COOKIE_NAME } from "@/lib/admin-auth";

export interface SessionData {
  teamMemberId: string;
  name: string;
  email: string;
  roleLevel: RoleLevel;
}

function readSessionCookie(): SessionData | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";");
  for (const c of cookies) {
    const [key, ...rest] = c.trim().split("=");
    if (key === COOKIE_NAME) {
      try {
        const value = rest.join("=");
        const parsed = JSON.parse(atob(decodeURIComponent(value)));
        if (!parsed.tid || !parsed.name || !parsed.email) return null;
        return {
          teamMemberId: parsed.tid,
          name: parsed.name,
          email: parsed.email,
          roleLevel: validateRoleLevel(parsed.rl),
        };
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function useSession(): SessionData | null {
  // Read once per render — cookie doesn't change within a session
  return useMemo(() => readSessionCookie(), []);
}
