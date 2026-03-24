import { redirect } from "next/navigation";

export default function TeamRedirect() {
  redirect("/admin/settings/team");
}
