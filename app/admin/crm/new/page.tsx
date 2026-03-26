"use client";

import ClientOnboardingForm from "@/components/ClientOnboardingForm";

export default function NewClientPage() {
  function handleSaved(slug: string) {
    window.location.href = `/admin/crm?enrich=${encodeURIComponent(slug)}`;
  }

  function handleCancel() {
    window.location.href = "/admin/crm";
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Add New Client</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Complete client onboarding with all details
          </p>
        </div>
      </div>

      <ClientOnboardingForm
        onSaved={handleSaved}
        onCancel={handleCancel}
      />
    </div>
  );
}
