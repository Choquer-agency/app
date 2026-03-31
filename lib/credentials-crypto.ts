import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptCredentials(plaintext: string): { ciphertext: string; iv: string } {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return {
    ciphertext: encrypted + ":" + tag,
    iv: iv.toString("hex"),
  };
}

export function decryptCredentials(ciphertext: string, iv: string): string {
  const key = getKey();
  const [encrypted, tag] = ciphertext.split(":");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
