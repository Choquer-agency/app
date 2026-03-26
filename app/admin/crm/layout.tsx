import CRMSubNav from "@/components/CRMSubNav";

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="-mx-10 -mt-8 mb-8">
        <CRMSubNav />
      </div>
      {children}
    </>
  );
}
