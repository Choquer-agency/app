"use client";

import { useState } from "react";

export interface MetaLeadAttribution {
  metaCampaignId?: string;
  metaAdSetId?: string;
  metaAdId?: string;
  metaFormId?: string;
  metaLeadgenId?: string;
  metaPageId?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  clientUserAgent?: string;
  clientIpAddress?: string;
  leadCapturedAt?: number;
  source?: string;
}

export interface MetaEventEntry {
  eventName: string;
  eventId: string;
  sentAt: number;
  fbTraceId?: string;
  status: string;
  error?: string;
  testMode?: boolean;
}

interface Props {
  attribution: MetaLeadAttribution;
  events?: MetaEventEntry[];
}

export function hasAnyMetaAttribution(a: MetaLeadAttribution): boolean {
  return Boolean(
    a.source === "meta_ads" ||
      a.metaCampaignId ||
      a.metaAdSetId ||
      a.metaAdId ||
      a.metaFormId ||
      a.metaLeadgenId ||
      a.fbclid ||
      a.fbc ||
      a.fbp
  );
}

function Row({ label, value, mono = true }: { label: string; value?: string | number; mono?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[11px] text-[var(--muted)] uppercase tracking-wide shrink-0">{label}</span>
      <span className={`text-xs text-[var(--foreground)] text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function EventBadge({ status }: { status: string }) {
  const cfg =
    status === "sent"
      ? { bg: "bg-emerald-100", text: "text-emerald-700", label: "Sent" }
      : { bg: "bg-red-100", text: "text-red-700", label: "Failed" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

export default function MetaLeadDetails({ attribution, events }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (!hasAnyMetaAttribution(attribution)) return null;

  const capturedAt = attribution.leadCapturedAt
    ? new Date(attribution.leadCapturedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : undefined;

  const adsManagerUrl = attribution.metaCampaignId
    ? `https://www.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${attribution.metaCampaignId}`
    : undefined;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-blue-50/40">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z" />
          </svg>
          <span className="text-xs font-semibold text-[var(--foreground)]">Meta Ads Attribution</span>
          {adsManagerUrl && (
            <a
              href={adsManagerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] text-blue-600 hover:underline ml-1"
            >
              Open in Ads Manager ↗
            </a>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-[var(--muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="bg-white rounded-md border border-[var(--border)] px-3 py-2">
            <Row label="Campaign ID" value={attribution.metaCampaignId} />
            <Row label="Ad Set ID" value={attribution.metaAdSetId} />
            <Row label="Ad ID" value={attribution.metaAdId} />
            <Row label="Form ID" value={attribution.metaFormId} />
            <Row label="Leadgen ID" value={attribution.metaLeadgenId} />
            <Row label="Page ID" value={attribution.metaPageId} />
            <Row label="Captured" value={capturedAt} mono={false} />
          </div>

          <div className="bg-white rounded-md border border-[var(--border)] px-3 py-2">
            <Row label="fbclid" value={attribution.fbclid} />
            <Row label="fbc" value={attribution.fbc} />
            <Row label="fbp" value={attribution.fbp} />
            <Row label="IP" value={attribution.clientIpAddress} />
            <Row label="UA" value={attribution.clientUserAgent} />
          </div>

          {events && events.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">
                Conversions API Events
              </div>
              <div className="bg-white rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
                {events
                  .slice()
                  .sort((a, b) => b.sentAt - a.sentAt)
                  .map((e) => (
                    <div key={e.eventId} className="px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--foreground)]">{e.eventName}</span>
                          <EventBadge status={e.status} />
                          {e.testMode && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-yellow-100 text-yellow-700">
                              Test
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--muted)]">
                          {new Date(e.sentAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {e.error && <div className="text-[11px] text-red-600 mt-1">{e.error}</div>}
                      {e.fbTraceId && (
                        <div className="text-[10px] text-[var(--muted)] font-mono mt-0.5">trace: {e.fbTraceId}</div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
