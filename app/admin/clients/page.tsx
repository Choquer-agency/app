import AdminClientList from "@/components/AdminClientList";
import GoalIssuesPanel from "@/components/GoalIssuesPanel";

export const dynamic = "force-dynamic";

export default function AdminClientsPage() {
  return (
    <>
      <GoalIssuesPanel />
      <AdminClientList />
    </>
  );
}
