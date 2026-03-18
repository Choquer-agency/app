import AdminClientList from "@/components/AdminClientList";

export const dynamic = "force-dynamic";

export default function AdminClientsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Clients</h2>
        <p className="text-sm text-gray-400 mt-1">
          Manage your agency clients
        </p>
      </div>
      <AdminClientList />
    </div>
  );
}
