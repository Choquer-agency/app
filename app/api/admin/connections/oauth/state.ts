import { createHmac, timingSafeEqual, randomBytes } from "crypto";

function getSecret(): Buffer {
  const s = process.env.OAUTH_STATE_SECRET || process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!s) throw new Error("OAUTH_STATE_SECRET (or CREDENTIALS_ENCRYPTION_KEY fallback) is not set");
  return Buffer.from(s);
}

export interface OAuthStatePayload {
  platform: string;
  scope: "org" | "client";
  clientId?: string;
  teamMemberId: string;
  nonce: string;
  iat: number;
}

export function signState(payload: Omit<OAuthStatePayload, "nonce" | "iat">): string {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: randomBytes(12).toString("hex"),
    iat: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): OAuthStatePayload {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("OAuth state signature mismatch");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (Date.now() - payload.iat > 10 * 60 * 1000) {
    throw new Error("OAuth state expired");
  }
  return payload;
}
