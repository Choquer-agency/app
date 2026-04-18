export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] p-8">
      {children}
    </div>
  );
}
