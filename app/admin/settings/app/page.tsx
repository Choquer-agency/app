import { redirect } from "next/navigation";

export default function AppSettingsRedirect() {
  redirect("/admin/settings/desktop");
}
