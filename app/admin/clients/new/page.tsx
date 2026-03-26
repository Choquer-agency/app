import { redirect } from "next/navigation";

export default function NewClientRedirect() {
  redirect("/admin/crm/new");
}
