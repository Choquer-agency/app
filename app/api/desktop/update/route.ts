import { NextRequest, NextResponse } from "next/server";


interface GitHubRelease {
  tag_name: string;
  body: string | null;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currentVersion = searchParams.get("current_version");

  if (!currentVersion) {
    return NextResponse.json(
      { error: "current_version is required" },
      { status: 400 }
    );
  }

  try {
    const release = await getLatestRelease();

    if (!release) {
      return new NextResponse(null, { status: 204 });
    }

    const latestVersion = release.tag_name.replace(/^v/, "");

    if (!isNewerVersion(latestVersion, currentVersion)) {
      return new NextResponse(null, { status: 204 });
    }

    const updateAsset = release.assets.find((a) =>
      a.name.endsWith(".app.tar.gz")
    );
    const signatureAsset = release.assets.find((a) =>
      a.name.endsWith(".app.tar.gz.sig")
    );

    if (!updateAsset || !signatureAsset) {
      return new NextResponse(null, { status: 204 });
    }

    const signatureResponse = await fetch(signatureAsset.browser_download_url);
    const signature = await signatureResponse.text();

    // Resolve GitHub's 302 redirect to get the direct download URL
    // Tauri's updater may not follow redirects properly
    const directUrl = await resolveRedirect(updateAsset.browser_download_url);

    return NextResponse.json({
      version: latestVersion,
      notes: release.body || "Bug fixes and improvements.",
      pub_date: release.published_at,
      platforms: {
        "darwin-aarch64": {
          signature: signature.trim(),
          url: directUrl,
        },
        "darwin-x86_64": {
          signature: signature.trim(),
          url: directUrl,
        },
      },
    });
  } catch (error) {
    console.error("Update check failed:", error);
    return new NextResponse(null, { status: 204 });
  }
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  const response = await fetch(
    "https://api.github.com/repos/Choquer-agency/app/releases/latest",
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "InsightPulse-Updater",
      },
      next: { revalidate: 60 },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return await response.json();
}

async function resolveRedirect(url: string): Promise<string> {
  const response = await fetch(url, { redirect: "manual" });
  if (response.status === 302 || response.status === 301) {
    return response.headers.get("location") || url;
  }
  return url;
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}
