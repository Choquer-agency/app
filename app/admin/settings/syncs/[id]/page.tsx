import SyncDetailClient from "./SyncDetailClient";

export default async function SyncDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SyncDetailClient id={id} />;
}
