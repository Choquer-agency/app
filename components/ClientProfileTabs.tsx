"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientConfig, TeamMember, ClientPackage } from "@/types";
import ClientPackagesPanel from "./ClientPackagesPanel";
import ClientNotesTimeline from "./ClientNotesTimeline";
import ClientDetailsForm from "./ClientDetailsForm";
import RecurringTicketManager from "./RecurringTicketManager";
import TicketListView from "./TicketListView";
import ClientHoursSummary from "./ClientHoursSummary";
import { friendlyDate } from "@/lib/date-format";

const TABS = [
  { id: "packages", label: "Packages & Billing" },
  { id: "tickets", label: "Tickets" },
  { id: "hours", label: "Hours" },
  { id: "overview", label: "Overview" },
  { id: "notes", label: "Activity Log" },
  { id: "recurring", label: "Recurring" },
  { id: "edit", label: "Edit" },
];

interface ClientProfileTabsProps {
  client: ClientConfig;
  teamMembers?: TeamMember[];
  onClientUpdated?: (client: ClientConfig) => void;
  onPackagesChanged?: () => void;
}

export default function ClientProfileTabs({ client, teamMembers = [], onClientUpdated, onPackagesChanged }: ClientProfileTabsProps) {
  const specialist = teamMembers.find((m) => m.name === client.accountSpecialist);
  const [activeTab, setActiveTab] = useState("packages");
  const [clientPackages, setClientPackages] = useState<ClientPackage[]>([]);

  const fetchClientPackages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/packages`);
      if (res.ok) setClientPackages(await res.json());
    } catch {}
  }, [client.id]);

  useEffect(() => {
    fetchClientPackages();
  }, [fetchClientPackages]);

  function handleSaved(updated: ClientConfig) {
    onClientUpdated?.(updated);
    setActiveTab("packages");
  }

  function handlePackagesChanged() {
    fetchClientPackages();
    onPackagesChanged?.();
  }

  function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  }

  // Build dynamic KPI cards based on active packages
  const activeAssignments = clientPackages.filter((cp) => cp.active);

  const CATEGORY_LABELS: Record<string, string> = {
    seo: "SEO Hours",
    retainer: "Retainer Hours",
    google_ads: "Google Ads Hours",
    social_media_ads: "Social Media Ads Hours",
    blog: "Blog",
    website: "Website",
  };

  // Group hours by category
  const hoursByCategory: { category: string; label: string; hours: number }[] = [];
  for (const cp of activeAssignments) {
    const cat = cp.packageCategory || "other";
    if (["seo", "retainer", "google_ads", "social_media_ads"].includes(cat)) {
      const hours = cp.customHours ?? cp.packageHoursIncluded ?? 0;
      if (hours > 0) {
        const existing = hoursByCategory.find((h) => h.category === cat);
        if (existing) {
          existing.hours += hours;
        } else {
          hoursByCategory.push({ category: cat, label: CATEGORY_LABELS[cat] || cat, hours });
        }
      }
    }
  }

  return (
    <div>
      {/* KPI Cards — connects to header above, no gap */}
      <div className="bg-[var(--accent-light)] rounded-b-xl p-5 border-t border-[var(--border)]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[var(--muted)] mb-1">MRR</p>
            <p className="text-xl font-bold text-[var(--foreground)]">{formatCurrency(client.mrr)}</p>
          </div>
          {hoursByCategory.map((h) => (
            <div key={h.category}>
              <p className="text-xs text-[var(--muted)] mb-1">{h.label}</p>
              <p className="text-xl font-bold text-[var(--foreground)]">{h.hours}h</p>
            </div>
          ))}
          <div>
            <p className="text-xs text-[var(--muted)] mb-1">Specialist</p>
            <div className="flex items-center gap-2 mt-1">
              {specialist?.profilePicUrl ? (
                <img src={specialist.profilePicUrl} alt={specialist.name} className="w-6 h-6 rounded-full object-cover" />
              ) : client.accountSpecialist ? (
                <div className="w-6 h-6 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] text-xs font-bold">
                  {client.accountSpecialist.charAt(0).toUpperCase()}
                </div>
              ) : null}
              <p className="text-sm font-medium text-[var(--foreground)]">
                {client.accountSpecialist || "--"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)] mb-1">Last Contact</p>
            <p className="text-sm font-medium text-[var(--foreground)] mt-1">
              {client.lastContactDate
                ? friendlyDate(client.lastContactDate)
                : "--"}
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[var(--border)] mt-6">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.id
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Account Info */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Account Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-[var(--muted)]">Next Review</span>
                  <p className="font-medium text-[var(--foreground)]">{client.nextReviewDate || "--"}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Country</span>
                  <p className="font-medium text-[var(--foreground)]">
                    {client.country === "CA" ? "Canada" : "United States"}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Industry</span>
                  <p className="font-medium text-[var(--foreground)]">{client.industry || "--"}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Status</span>
                  <p className="font-medium text-[var(--foreground)] capitalize">{client.clientStatus}</p>
                </div>
              </div>
            </div>

            {/* Integration Status */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Integrations — InsightPulse</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "GA4", connected: !!client.ga4PropertyId },
                  { label: "Search Console", connected: !!client.gscSiteUrl },
                  { label: "Notion", connected: !!client.notionPageUrl },
                  { label: "Booking", connected: !!client.calLink },
                ].map((integration) => (
                  <div
                    key={integration.label}
                    className={`text-xs px-3 py-2 rounded-lg font-medium ${
                      integration.connected
                        ? "bg-[#BDFFE8] text-[#0d7a55]"
                        : "bg-gray-50 text-[var(--muted)]"
                    }`}
                  >
                    {integration.connected ? "Connected" : "Not connected"} — {integration.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "packages" && (
          <ClientPackagesPanel clientId={client.id} clientCountry={client.country} onPackagesChanged={handlePackagesChanged} />
        )}

        {activeTab === "notes" && (
          <ClientNotesTimeline clientId={client.id} />
        )}

        {activeTab === "tickets" && (
          <TicketListView clientId={client.id} />
        )}

        {activeTab === "hours" && (
          <ClientHoursSummary clientId={client.id} />
        )}

        {activeTab === "recurring" && (
          <RecurringTicketManager
            clientId={client.id}
            clientName={client.name}
            teamMembers={teamMembers}
          />
        )}

        {activeTab === "edit" && (
          <ClientDetailsForm
            client={client}
            onSaved={handleSaved}
            onCancel={() => setActiveTab("overview")}
          />
        )}
      </div>
    </div>
  );
}
