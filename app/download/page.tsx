import { Metadata } from "next";
import Image from "next/image";

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
    <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="mb-6">
          <Image
            src="/choquer-icon.png"
            alt="Choquer Agency"
            width={80}
            height={80}
            className="mx-auto rounded-2xl shadow-lg"
          />
        </div>

        <h1 className="text-2xl font-bold text-[#263926]">
          Choquer.Agency
        </h1>
        <p className="text-sm text-[#6B6B6B] mt-1.5">
          Native macOS app with real-time notifications and auto-updates
        </p>

        {/* Download card */}
        <div className="mt-8 bg-white border border-[#E8E6DF] rounded-2xl p-6 shadow-sm">
          {dmgAsset ? (
            <>
              <div className="flex items-center justify-between mb-5 text-left">
                <div>
                  <p className="text-sm font-semibold text-[#263926]">
                    macOS (Universal)
                  </p>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">
                    Intel &amp; Apple Silicon
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#263926]">
                    v{version}
                  </p>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">
                    {formatBytes(dmgAsset.size)}
                  </p>
                </div>
              </div>
              <a
                href={dmgAsset.browser_download_url}
                className="block w-full text-center px-4 py-3 text-sm font-semibold text-white bg-[#F7941D] rounded-xl hover:bg-[#E8851A] transition-colors shadow-sm"
              >
                Download for macOS
              </a>
              {publishedDate && (
                <p className="text-xs text-[#9CA3AF] mt-3">
                  Released {publishedDate}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#6B6B6B] py-4">
              No releases available yet.
            </p>
          )}
        </div>

        {/* Install + Requirements side by side */}
        <div className="mt-6 grid grid-cols-2 gap-4 text-left">
          <div>
            <h2 className="text-xs font-semibold text-[#263926] uppercase tracking-wide mb-2">
              Installation
            </h2>
            <ol className="text-xs text-[#6B6B6B] space-y-1.5 list-decimal list-inside">
              <li>Download the DMG file</li>
              <li>Drag to Applications</li>
              <li>Open and log in</li>
              <li>Auto-updates enabled</li>
            </ol>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-[#263926] uppercase tracking-wide mb-2">
              Requirements
            </h2>
            <ul className="text-xs text-[#6B6B6B] space-y-1.5">
              <li>macOS 11 (Big Sur)+</li>
              <li>Intel or Apple Silicon</li>
              <li>Internet connection</li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-[#9CA3AF] mt-8">
          Choquer Agency
        </p>
      </div>
    </div>
  );
}
