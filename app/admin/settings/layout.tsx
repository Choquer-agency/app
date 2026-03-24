import SettingsSubNav from "@/components/SettingsSubNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Break out of parent container to render full-width sub-nav */}
      <div className="-mx-10 -mt-8 mb-8">
        <SettingsSubNav />
      </div>
      {children}
    </>
  );
}
