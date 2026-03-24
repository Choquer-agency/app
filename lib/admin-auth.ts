import { NextRequest } from "next/server";
import { RoleLevel, validateRoleLevel } from "./permissions";

export interface AdminSession {
  teamMemberId: number;
  name: string;
  email: string;
  roleLevel: RoleLevel;
}

export const COOKIE_NAME = "insightpulse_admin";

interface CookiePayload {
  tid: number;
  name: string;
  email: string;
  rl: string;
  iat: number;
}

export function encodeCookie(session: AdminSession): string {
  const payload: CookiePayload = {
    tid: session.teamMemberId,
    name: session.name,
    email: session.email,
    rl: session.roleLevel,
    iat: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function decodeCookie(cookieValue: string): AdminSession | null {
  try {
    const parsed: CookiePayload = JSON.parse(
      Buffer.from(cookieValue, "base64").toString("utf-8")
    );
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

/** Extract admin session from a NextRequest (for API routes) */
export function getSession(request: NextRequest): AdminSession | null {
  const value = request.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return decodeCookie(value);
}

/** Extract admin session from a cookie store (for server components) */
export function getSessionFromCookies(cookieStore: {
  get(name: string): { value: string } | undefined;
}): AdminSession | null {
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return decodeCookie(value);
}
