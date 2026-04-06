import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Choquer.Agency Desktop",
  description:
    "Download Choquer.Agency for macOS — native desktop app with notifications, dock badge, and auto-updates.",
};

interface GitHubRelease {
  tag_name: string;
  body: string | null;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/Choquer-agency/app/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "InsightPulse-Download",
        },
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DownloadPage() {
  const release = await getLatestRelease();

  const dmgAsset = release?.assets.find((a) => a.name.endsWith(".dmg"));
  const version = release?.tag_name?.replace(/^v/, "") || "\u2014";
  const publishedDate = release?.published_at
    ? new Date(release.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-gray-900">
            Choquer.Agency Desktop
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Native macOS app with real-time notifications and auto-updates
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl p-6">
          {dmgAsset ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    macOS (Universal)
                  </p>
                  <p className="text-xs text-gray-500">
                    Intel &amp; Apple Silicon
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    v{version}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatBytes(dmgAsset.size)}
                  </p>
                </div>
              </div>
              <a
                href={dmgAsset.browser_download_url}
                className="block w-full text-center px-4 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Download for macOS
              </a>
              {publishedDate && (
                <p className="text-xs text-gray-400 text-center mt-3">
                  Released {publishedDate}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              No releases available yet.
            </p>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-900 mb-3">
            Installation
          </h2>
          <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside">
            <li>Download the DMG file above</li>
            <li>
              Open the DMG &mdash; drag Choquer.Agency to your Applications
              folder
            </li>
            <li>
              Open Choquer.Agency from Applications &mdash; log in with your
              admin credentials
            </li>
            <li>The app will auto-update when new versions are available</li>
          </ol>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-900 mb-2">
            Requirements
          </h2>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>macOS 11 (Big Sur) or later</li>
            <li>Intel or Apple Silicon Mac</li>
            <li>Internet connection required</li>
          </ul>
        </div>

        {release?.body && (
          <div className="mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">
              What&apos;s New
            </h2>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">
              {release.body}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
