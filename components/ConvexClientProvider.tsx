"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useEffect } from "react";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
// Dev read-only mode disabled — allow writes to production from localhost for testing
const IS_DEV_READ_ONLY = false;

const convex = new ConvexReactClient(CONVEX_URL);

function DevReadOnlyFetchGuard() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const isWrite = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
      const isAppApi = url.startsWith("/api/") || url.includes(window.location.host + "/api/");
      if (isWrite && isAppApi) {
        const msg = `[dev read-only] ${method} ${url} blocked — writes disabled against production data.`;
        console.warn(msg);
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Read-only dev mode" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return nativeFetch(input as any, init);
    };
    return () => { window.fetch = nativeFetch; };
  }, []);
  return null;
}

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexProvider client={convex}>
      {IS_DEV_READ_ONLY && <DevReadOnlyFetchGuard />}
      {children}
    </ConvexProvider>
  );
}
