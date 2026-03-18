"use client";

import { useState } from "react";

const SERVICE_ACCOUNT_EMAIL =
  "insightpulse@gen-lang-client-0803026287.iam.gserviceaccount.com";

interface AnalyticsBlurOverlayProps {
  connected: boolean;
  children: React.ReactNode;
}

export default function AnalyticsBlurOverlay({
  connected,
  children,
}: AnalyticsBlurOverlayProps) {
  const [copied, setCopied] = useState(false);

  if (connected) return <>{children}</>;

  async function handleCopy() {
    await navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Blurred backdrop */}
      <div
        className="blur-sm pointer-events-none select-none opacity-40"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Compact setup card */}
      <div className="absolute inset-0 flex items-center justify-center z-10 p-4">
        <div className="bg-white rounded-xl shadow-md px-6 py-5 max-w-xs w-full text-center border border-gray-100">
          <p className="text-sm font-semibold text-gray-900 mb-1">
            Analytics Not Connected
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Grant access to see live data.
          </p>

          <div className="text-left text-xs space-y-2 text-gray-600">
            <p>
              <span className="font-medium text-gray-800">1.</span> Add this
              email as a <span className="font-medium">Viewer</span> in GA4 and{" "}
              <span className="font-medium">Restricted</span> in Search Console:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-100 text-[10px] px-2 py-1.5 rounded break-all text-gray-700">
                {SERVICE_ACCOUNT_EMAIL}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 px-2 py-1.5 text-[10px] font-medium rounded bg-[#FFF3E0] text-[#FF9500] hover:bg-[#FFE0B2] transition"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p>
              <span className="font-medium text-gray-800">2.</span> Data appears
              automatically once access is granted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
