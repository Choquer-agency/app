import { Langfuse } from "langfuse";

let langfuseInstance: Langfuse | null = null;

export function getLangfuse(): Langfuse {
  if (!langfuseInstance) {
    langfuseInstance = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    });
  }
  return langfuseInstance;
}

/**
 * Flush all pending Langfuse events.
 * Call this at the end of API route handlers to ensure data is sent.
 */
export async function flushLangfuse(): Promise<void> {
  if (langfuseInstance) {
    await langfuseInstance.flushAsync();
  }
}
