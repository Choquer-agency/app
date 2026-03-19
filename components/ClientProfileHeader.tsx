"use client";

import { useState } from "react";
import { ClientConfig, TeamMember } from "@/types";
import ClientStatusBadge from "./ClientStatusBadge";
import CopyField from "./CopyField";

interface ClientProfileHeaderProps {
  client: ClientConfig;
  teamMembers?: TeamMember[];
}

function hasAllConnections(client: ClientConfig): boolean {
  return !!(client.ga4PropertyId && client.gscSiteUrl && client.notionPageUrl && client.calLink);
}

export default function ClientProfileHeader({ client, teamMembers = [] }: ClientProfileHeaderProps) {
  const [enriching, setEnriching] = useState(false);
  const specialist = teamMembers.find((m) => m.name === client.accountSpecialist);
  const addressParts = [
    client.addressLine1,
    client.addressLine2,
    client.city,
    client.provinceState,
    client.postalCode,
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0
    ? [...addressParts, client.country].join(", ")
    : "";

  return (
    <div className="bg-[var(--accent-light)] rounded-t-xl p-6">
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{client.name}</h1>
            <ClientStatusBadge status={client.clientStatus} />
            <div
              className={`w-2 h-2 rounded-full ${hasAllConnections(client) ? 'bg-emerald-500' : 'bg-red-500'}`}
              title={hasAllConnections(client) ? 'All integrations connected' : 'Missing integrations'}
            />
          </div>
          <div className="flex items-center gap-3">
            {client.websiteUrl && (
              <a
                href={client.websiteUrl.startsWith("http") ? client.websiteUrl : `https://${client.websiteUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                {client.websiteUrl}
              </a>
            )}
            {client.industry && (
              <span className="text-xs text-[var(--muted)]">{client.industry}</span>
            )}
          </div>
          {client.clientStatus === "offboarding" && client.offboardingDate && (
            <p className="text-xs text-[#b91c1c] mt-1 font-medium">
              Last working day: {client.offboardingDate}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (enriching) return;
              setEnriching(true);
              try {
                const res = await fetch(`/api/admin/enrich/${client.slug}`, { method: "POST" });
                if (res.ok) {
                  const data = await res.json();
                  alert(`Dashboard updated! ${data.tasks} tasks, ${data.goals} goals synced.`);
                } else {
                  const data = await res.json();
                  alert(`Sync failed: ${data.error}`);
                }
              } catch {
                alert("Sync failed — check your connection.");
              } finally {
                setEnriching(false);
              }
            }}
            disabled={enriching}
            title="Sync Notion to dashboard"
            className={`p-1.5 rounded-lg border border-[var(--accent)] transition ${
              enriching
                ? "opacity-50 cursor-wait"
                : "text-[var(--accent)] hover:bg-[var(--accent-light)]"
            }`}
          >
            <svg
              className={`w-4 h-4 ${enriching ? "animate-spin-reverse" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <a
            href={`/${client.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-[var(--accent)] border border-[var(--accent)] rounded-lg hover:bg-[var(--accent-light)] transition"
          >
            View Dashboard
          </a>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {/* Contact */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            Primary Contact
          </h3>
          {client.contactName && (
            <p className="font-medium text-[var(--foreground)]">{client.contactName}</p>
          )}
          {client.contactEmail && (
            <div className="text-[var(--foreground)]">
              <CopyField value={client.contactEmail} label="email" />
            </div>
          )}
          {client.contactPhone && (
            <div className="text-[var(--foreground)]">
              <CopyField value={client.contactPhone} label="phone" />
            </div>
          )}
          {fullAddress && (
            <p className="text-[var(--muted)] text-xs">{fullAddress}</p>
          )}
        </div>

        {/* Account */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            Account Details
          </h3>
          {client.accountSpecialist && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--muted)]">Specialist:</span>
              {specialist?.profilePicUrl ? (
                <img src={specialist.profilePicUrl} alt={specialist.name} className="w-6 h-6 rounded-full object-cover" />
              ) : specialist ? (
                <div className="w-6 h-6 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] text-xs font-bold">
                  {specialist.name.charAt(0).toUpperCase()}
                </div>
              ) : null}
              <span className="font-medium text-[var(--foreground)]">{client.accountSpecialist}</span>
            </div>
          )}
          <p>
            <span className="text-[var(--muted)]">Country:</span>{" "}
            <span className="font-medium text-[var(--foreground)]">
              {client.country === "CA" ? "Canada" : "United States"}
            </span>
          </p>
          {client.slug && (
            <p>
              <span className="text-[var(--muted)]">Slug:</span>{" "}
              <span className="text-[var(--muted)]">{client.slug}</span>
            </p>
          )}
        </div>

        {/* Social */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            Social
          </h3>
          <div className="flex flex-wrap gap-2">
            {client.socialLinkedin && (
              <a href={client.socialLinkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted)] hover:text-[var(--accent)] bg-[var(--accent-light)] px-2 py-1 rounded">
                LinkedIn
              </a>
            )}
            {client.socialFacebook && (
              <a href={client.socialFacebook} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted)] hover:text-[var(--accent)] bg-[var(--accent-light)] px-2 py-1 rounded">
                Facebook
              </a>
            )}
            {client.socialInstagram && (
              <a href={client.socialInstagram} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted)] hover:text-[var(--accent)] bg-[var(--accent-light)] px-2 py-1 rounded">
                Instagram
              </a>
            )}
            {client.socialX && (
              <a href={client.socialX} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted)] hover:text-[var(--accent)] bg-[var(--accent-light)] px-2 py-1 rounded">
                X
              </a>
            )}
            {!client.socialLinkedin && !client.socialFacebook && !client.socialInstagram && !client.socialX && (
              <span className="text-xs text-[var(--muted)]">No social links</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
