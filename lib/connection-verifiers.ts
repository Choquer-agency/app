/**
 * Lightweight verification functions for each platform.
 * Each verifier calls the simplest possible API endpoint to confirm credentials work.
 */

type VerifyResult = { success: boolean; error?: string };

export async function verifyConnection(
  platform: string,
  creds: Record<string, string>
): Promise<VerifyResult> {
  const verifier = VERIFIERS[platform];
  if (!verifier) {
    return { success: true }; // Unknown platform — skip verification
  }
  try {
    return await verifier(creds);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

const VERIFIERS: Record<string, (creds: Record<string, string>) => Promise<VerifyResult>> = {
  stripe: async (creds) => {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (res.ok) return { success: true };
    const body = await res.json().catch(() => ({}));
    return { success: false, error: body?.error?.message || `HTTP ${res.status}` };
  },

  airtable: async (creds) => {
    const res = await fetch("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  mailerlite: async (creds) => {
    const res = await fetch("https://connect.mailerlite.com/api/subscribers?limit=1", {
      headers: { Authorization: `Bearer ${creds.apiKey}`, "Content-Type": "application/json" },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  mailersend: async (creds) => {
    const res = await fetch("https://api.mailersend.com/v1/domains?limit=1", {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  intercom: async (creds) => {
    const res = await fetch("https://api.intercom.io/me", {
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: "application/json" },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  notion: async (creds) => {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Notion-Version": "2022-06-28",
      },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  slack: async (creds) => {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    const body = await res.json().catch(() => ({ ok: false }));
    if (body.ok) return { success: true };
    return { success: false, error: body.error || "Auth test failed" };
  },

  pagespeed: async (creds) => {
    // PageSpeed Insights API key — test with a simple query
    const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://google.com&key=${creds.apiKey}&strategy=mobile&category=performance`;
    const res = await fetch(url);
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  // OAuth platforms verify using the access token
  google_ads: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch(
      "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers",
      { headers: { Authorization: `Bearer ${creds.accessToken}` } }
    );
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  meta_ads: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${creds.accessToken}`);
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  gsc: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  gmb: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  instagram: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id&access_token=${creds.accessToken}`);
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  linkedin_ads: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  linkedin_pages: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  ipinfo: async (creds) => {
    const res = await fetch(`https://ipinfo.io/8.8.8.8?token=${creds.apiKey}`);
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },

  google_merchant: async (creds) => {
    if (!creds.accessToken) return { success: false, error: "No access token" };
    const res = await fetch("https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo", {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status}` };
  },
};
