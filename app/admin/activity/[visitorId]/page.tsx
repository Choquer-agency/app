import { redirect } from "next/navigation";

export default async function VisitorDetailRedirect({
  params,
}: {
  params: Promise<{ visitorId: string }>;
}) {
  const { visitorId } = await params;
  redirect(`/admin/settings/activity/${visitorId}`);
}
