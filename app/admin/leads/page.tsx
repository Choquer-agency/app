import { redirect } from "next/navigation";

export default function AdminLeadsRedirect() {
  redirect("/admin/crm/leads");
}
