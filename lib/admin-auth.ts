import { NextRequest } from "next/server";

export interface AdminSession {
  name: string;
  email: string;
}

export const COOKIE_NAME = "insightpulse_admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

interface CookiePayload {
  pwd: string;
  name: string;
  email: string;
}

export function encodeCookie(session: AdminSession): string {
  const payload: CookiePayload = { pwd: ADMIN_PASSWORD, ...session };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function decodeCookie(cookieValue: string): AdminSession | null {
  try {
    const parsed: CookiePayload = JSON.parse(
      Buffer.from(cookieValue, "base64").toString("utf-8")
    );
    if (parsed.pwd !== ADMIN_PASSWORD) return null;
    if (!parsed.name || !parsed.email) return null;
    return { name: parsed.name, email: parsed.email };
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
