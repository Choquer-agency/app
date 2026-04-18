import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
// Dev read-only mode disabled — allow writes to production from localhost for testing
const IS_DEV_READ_ONLY = false;

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    client = new ConvexHttpClient(CONVEX_URL);
    if (IS_DEV_READ_ONLY) {
      const block = (kind: "mutation" | "action") => async (name: unknown) => {
        const fnName = typeof name === "string" ? name : (name as any)?._name || "unknown";
        throw new Error(
          `[dev read-only] ${kind} "${fnName}" blocked — localhost is reading prod Convex. Writes are disabled.`
        );
      };
      (client as any).mutation = block("mutation");
      (client as any).action = block("action");
    }
  }
  return client;
}
