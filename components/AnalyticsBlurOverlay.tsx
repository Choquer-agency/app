"use client";

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
  if (connected) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred backdrop — placeholder data rendered but not readable */}
      <div
        className="blur-sm pointer-events-none select-none"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Setup instructions overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center border border-gray-200">
          <div className="text-3xl mb-3">📊</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Analytics Not Connected
          </h3>
          <p className="text-sm text-gray-600 mb-5">
            Connect Google Search Console and Google Analytics to see live
            performance data for this client.
          </p>
          <div className="text-left text-sm bg-gray-50 rounded-xl p-5 space-y-3">
            <p className="font-semibold text-gray-800">Setup Steps</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-600">
              <li>
                Open{" "}
                <span className="font-medium text-gray-800">
                  Google Search Console
                </span>{" "}
                for the client&apos;s site
              </li>
              <li>
                Go to{" "}
                <span className="font-medium">
                  Settings → Users and permissions
                </span>
              </li>
              <li>
                Add the service account as a{" "}
                <span className="font-medium">Restricted</span> user:
                <code className="block mt-1 bg-gray-200 text-xs px-2 py-1.5 rounded break-all">
                  {SERVICE_ACCOUNT_EMAIL}
                </code>
              </li>
              <li>
                Open{" "}
                <span className="font-medium text-gray-800">
                  Google Analytics
                </span>{" "}
                → Admin → Property Access Management
              </li>
              <li>
                Add the same email as a{" "}
                <span className="font-medium">Viewer</span>
              </li>
              <li>
                Let your SEO team know once access is granted — data will appear
                automatically
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
