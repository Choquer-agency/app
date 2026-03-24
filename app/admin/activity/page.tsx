import { redirect } from "next/navigation";

export default function ActivityRedirect() {
  redirect("/admin/settings/activity");
}
