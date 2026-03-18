import { google, Auth } from "googleapis";

let authClient: Auth.GoogleAuth | null = null;

function getAuth(): Auth.GoogleAuth {
  if (authClient) return authClient;

  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var is not set");
  }

  const credentials = JSON.parse(keyJson);

  authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/analytics.readonly",
    ],
  });

  return authClient;
}

export function getSearchConsoleClient() {
  return google.searchconsole({ version: "v1", auth: getAuth() });
}

export function getAnalyticsDataClient() {
  return google.analyticsdata({ version: "v1beta", auth: getAuth() });
}
