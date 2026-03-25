import { getClientById } from "@/lib/clients";
import { syncClientMrr } from "@/lib/client-packages";
import { notFound } from "next/navigation";
import ClientDetailView from "@/components/ClientDetailView";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await syncClientMrr(id).catch(() => {});
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  return (
    <div>
      <a
        href="/admin/clients"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition mb-6"
      >
        &larr; All Clients
      </a>
      <ClientDetailView client={client} />
    </div>
  );
}
