"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LeadSlidePanel } from "./AdminLeadsList";
import ConvertLeadModal from "./ConvertLeadModal";

export default function LeadDetailView({ leadId }: { leadId: string }) {
  const router = useRouter();
  const leadsData = useQuery(api.leads.list);
  const lead = (leadsData ?? []).find((l: any) => l._id === leadId);

  const updateLead = useMutation(api.leads.update);
  const updateQualification = useMutation(api.leads.updateQualification);
  const removeLead = useMutation(api.leads.remove);
  const convertToClient = useMutation(api.leads.convertToClient);
  const [convertOpen, setConvertOpen] = useState(false);

  if (leadsData === undefined) {
    return <div className="text-center py-12 text-[var(--muted)] text-sm">Loading...</div>;
  }
  if (!lead) {
    return <div className="text-center py-12 text-[var(--muted)] text-sm">Lead not found.</div>;
  }

  async function handleSave(data: any) {
    try {
      await updateLead({
        id: lead._id as Id<"leads">,
        company: data.company,
        contactName: data.contactName,
        contactRole: data.contactRole,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        website: data.website,
        status: data.status,
        notes: data.notes,
        source: data.source,
        value: data.value,
        currency: data.currency,
      });
    } catch {}
  }

  async function handleQualification(
    qualification: "qualified" | "unqualified" | "converted" | "unset",
    extras?: { value?: number; currency?: string }
  ) {
    try {
      await updateQualification({
        id: lead._id as Id<"leads">,
        qualification,
        value: extras?.value,
        currency: extras?.currency,
      });
    } catch {}
  }

  async function handleDelete() {
    try {
      await removeLead({ id: lead._id as Id<"leads"> });
      router.push("/admin/crm/leads");
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function handleConvert(args: {
    client: any;
    signupDate: string;
    notes?: string;
    packages: {
      packageId: string;
      contractEndDate: string | null;
      applySetupFee: boolean;
      isOneTime: boolean;
      paidDate?: string;
      customPrice?: number | null;
      customHours?: number | null;
    }[];
  }) {
    const result = await convertToClient({
      id: lead._id as Id<"leads">,
      name: args.client.name,
      websiteUrl: args.client.websiteUrl,
      contactName: args.client.contactName,
      contactEmail: args.client.contactEmail,
      contactPhone: args.client.contactPhone || undefined,
      country: args.client.country,
      industry: args.client.industry || undefined,
      accountSpecialist: args.client.accountSpecialist || undefined,
      addressLine1: args.client.addressLine1 || undefined,
      addressLine2: args.client.addressLine2 || undefined,
      city: args.client.city || undefined,
      provinceState: args.client.provinceState || undefined,
      postalCode: args.client.postalCode || undefined,
      ga4PropertyId: args.client.ga4PropertyId || undefined,
      gscSiteUrl: args.client.gscSiteUrl || undefined,
      googleAdsCustomerId: args.client.googleAdsCustomerId || undefined,
      notionPageUrl: args.client.notionPageUrl || undefined,
      calLink: args.client.calLink || undefined,
    });
    for (const p of args.packages) {
      const res = await fetch(`/api/admin/clients/${result.clientId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: p.packageId,
          signupDate: args.signupDate,
          contractEndDate: p.contractEndDate,
          applySetupFee: p.applySetupFee,
          isOneTime: p.isOneTime,
          paidDate: p.paidDate,
          customPrice: p.customPrice ?? null,
          customHours: p.customHours ?? null,
          notes: args.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to assign package");
      }
    }
    router.push(`/admin/crm/${result.clientId}`);
  }

  return (
    <>
      <LeadSlidePanel
        inline
        lead={lead as any}
        onSave={handleSave}
        onQualificationChange={handleQualification}
        onDelete={handleDelete}
        onAddToClients={() => setConvertOpen(true)}
        onClose={() => router.push("/admin/crm/leads")}
      />
      {convertOpen && (
        <ConvertLeadModal
          leadId={lead._id}
          lead={{
            company: lead.company,
            website: lead.website,
            contactName: lead.contactName,
            contactEmail: lead.contactEmail,
            contactPhone: lead.contactPhone,
          }}
          onClose={() => setConvertOpen(false)}
          onConvert={handleConvert}
        />
      )}
    </>
  );
}
