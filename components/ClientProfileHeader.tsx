"use client";

import { ClientConfig, TeamMember } from "@/types";
import ClientStatusBadge from "./ClientStatusBadge";
import CopyField from "./CopyField";

interface ClientProfileHeaderProps {
  client: ClientConfig;
  teamMembers?: TeamMember[];
}

export default function ClientProfileHeader({ client, teamMembers = [] }: ClientProfileHeaderProps) {
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
    <div className="bg-[#FFFAF3] rounded-t-xl p-6">
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{client.name}</h1>
            <ClientStatusBadge status={client.clientStatus} />
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
        <a
          href={`/${client.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-xs font-medium text-[var(--accent)] border border-[var(--accent)] rounded-lg hover:bg-[var(--accent-light)] transition"
        >
          View Dashboard
        </a>
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
