import TicketsSubNav from "@/components/TicketsSubNav";

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Break out of parent container to render full-width sub-nav */}
      <div className="-mx-10 -mt-8 mb-8">
        <TicketsSubNav />
      </div>
      {children}
    </>
  );
}
