import Image from "next/image";

const CATEGORY_LABELS: Record<string, string> = {
  seo: "SEO",
  retainer: "Retainer",
  google_ads: "Google Ads",
  social_media_ads: "Social Media Ads",
  blog: "Blog",
  website: "Website",
  other: "Services",
};

interface PackageStubViewProps {
  packageName: string;
  packageCategory: string;
}

export default function PackageStubView({ packageName, packageCategory }: PackageStubViewProps) {
  const displayName = packageName || CATEGORY_LABELS[packageCategory] || packageCategory;

  return (
    <div className="bg-[#FAFCFF] rounded-2xl px-8 py-16 text-center border border-[#E8F0FE]">
      <Image
        src="/choquer-logo.svg"
        alt="Choquer Agency"
        width={120}
        height={30}
        className="mx-auto mb-6 opacity-40"
      />
      <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">
        {displayName} Dashboard
      </h2>
      <p className="text-sm text-[#6b7280] max-w-sm mx-auto">
        Your {displayName.toLowerCase()} dashboard is coming soon.
        We&apos;re building a dedicated view to track your {displayName.toLowerCase()} performance and deliverables.
      </p>
    </div>
  );
}
