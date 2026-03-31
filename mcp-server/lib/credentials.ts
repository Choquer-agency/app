import { createDecipheriv } from "crypto";

export function decryptCredentials(ciphertext: string, iv: string): Record<string, string> {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string");
  }
  const key = Buffer.from(hex, "hex");
  const [encrypted, tag] = ciphertext.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}
