"use client";

import { useState, useEffect, useCallback } from "react";
import { VisitorIdentification } from "@/types";

interface VisitorIdentifierProps {
  slug: string;
  onIdentified: (visitor: VisitorIdentification) => void;
}

function generateDeviceId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceType(): "mobile" | "desktop" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

function getStorageKey(slug: string): string {
  return `insightpulse_visitor_${slug}`;
}

export default function VisitorIdentifier({ slug, onIdentified }: VisitorIdentifierProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const identify = useCallback(
    async (deviceId: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/visitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lookup", clientSlug: slug, deviceId }),
        });
        const data = await res.json();

        if (data.visitor) {
          const identification: VisitorIdentification = {
            visitorId: data.visitor.id,
            visitorName: data.visitor.visitorName,
            deviceId,
          };
          localStorage.setItem(getStorageKey(slug), JSON.stringify(identification));
          onIdentified(identification);
          return true;
        }
      } catch {
        // API not available (no DB), skip identification
      }
      return false;
    },
    [slug, onIdentified]
  );

  useEffect(() => {
    async function init() {
      // If the user is a logged-in team member, skip the prompt entirely
      const adminCookie = document.cookie.split("; ").find((c) => c.startsWith("insightpulse_admin="));
      if (adminCookie) {
        try {
          const payload = JSON.parse(atob(adminCookie.split("=")[1]));
          if (payload.name) {
            const deviceId = generateDeviceId();
            const identification: VisitorIdentification = {
              visitorId: 0,
              visitorName: payload.name,
              deviceId,
            };
            onIdentified(identification);
            return;
          }
        } catch {
          // Malformed cookie — fall through to normal flow
        }
      }

      // Check localStorage first — trust it if present
      const stored = localStorage.getItem(getStorageKey(slug));
      if (stored) {
        try {
          const parsed: VisitorIdentification = JSON.parse(stored);
          if (parsed.visitorName && parsed.deviceId) {
            onIdentified(parsed);
            identify(parsed.deviceId).catch(() => {});
            return;
          }
        } catch {
          // Corrupted localStorage — re-prompt
        }
      }

      // No stored visitor — show the name prompt
      const deviceId = generateDeviceId();
      localStorage.setItem(
        getStorageKey(slug) + "_pending_device",
        deviceId
      );
      setShowPrompt(true);
    }

    init();
  }, [slug, identify, onIdentified]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);

    const deviceId =
      localStorage.getItem(getStorageKey(slug) + "_pending_device") ||
      generateDeviceId();

    // Save locally first so refreshes never re-prompt
    const identification: VisitorIdentification = {
      visitorId: 0, // placeholder until DB confirms
      visitorName: trimmed,
      deviceId,
    };

    try {
      const res = await fetch("/api/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          clientSlug: slug,
          deviceId,
          visitorName: trimmed,
          deviceType: getDeviceType(),
          userAgent: navigator.userAgent,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.visitor) {
          identification.visitorId = data.visitor.id;
          identification.visitorName = data.visitor.visitorName || trimmed;
        }
      }
    } catch {
      // Network/DB error — still save locally
    } finally {
      localStorage.setItem(getStorageKey(slug), JSON.stringify(identification));
      localStorage.removeItem(getStorageKey(slug) + "_pending_device");
      onIdentified(identification);
      setShowPrompt(false);
      setSubmitting(false);
    }
  }

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full mx-4">
        <h2 className="text-lg font-semibold text-center mb-1">Welcome!</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          What&apos;s your name?
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            autoFocus
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="w-full mt-4 px-4 py-3 bg-accent text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
