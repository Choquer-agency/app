import { createHash } from "node:crypto";

// Meta requires all PII to be normalized, then SHA-256 hashed (lowercase hex).
// Spec: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
}

export function hashPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  // Strip all non-digits (Meta wants E.164-style digits only, no "+" or spaces).
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  return sha256Hex(digits);
}

export function hashName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
}

export function splitName(fullName: string | null | undefined): { first?: string; last?: string } {
  if (!fullName) return {};
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
