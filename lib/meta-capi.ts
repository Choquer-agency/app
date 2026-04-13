import { hashEmail, hashName, hashPhone, splitName } from "./pii-hash";

const META_API_VERSION = "v21.0";

export type MetaEventName = "Lead" | "QualifiedLead" | "Purchase";

export interface MetaEventUserData {
  email?: string;
  phone?: string;
  fullName?: string;
  fbc?: string;
  fbp?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  externalId?: string;
}

export interface MetaEventCustomData {
  leadStatus?: string;
  qualification?: string;
  value?: number;
  currency?: string;
  leadEventSource?: string;
}

export interface SendMetaEventArgs {
  eventName: MetaEventName;
  eventId: string;
  eventTime: number;
  userData: MetaEventUserData;
  customData?: MetaEventCustomData;
  actionSource?:
    | "website"
    | "system_generated"
    | "business_messaging"
    | "email"
    | "phone_call"
    | "chat"
    | "physical_store"
    | "app"
    | "other";
  eventSourceUrl?: string;
}

export interface MetaCapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

export interface SendMetaEventResult {
  success: boolean;
  fbTraceId?: string;
  error?: string;
  testMode: boolean;
  httpStatus?: number;
}

function buildUserData(ud: MetaEventUserData): Record<string, unknown> {
  const { first, last } = splitName(ud.fullName);
  const data: Record<string, unknown> = {};
  const em = hashEmail(ud.email);
  if (em) data.em = [em];
  const ph = hashPhone(ud.phone);
  if (ph) data.ph = [ph];
  const fn = hashName(first);
  if (fn) data.fn = [fn];
  const ln = hashName(last);
  if (ln) data.ln = [ln];
  if (ud.fbc) data.fbc = ud.fbc;
  if (ud.fbp) data.fbp = ud.fbp;
  if (ud.clientIpAddress) data.client_ip_address = ud.clientIpAddress;
  if (ud.clientUserAgent) data.client_user_agent = ud.clientUserAgent;
  if (ud.externalId) data.external_id = [ud.externalId];
  return data;
}

function buildCustomData(cd: MetaEventCustomData | undefined): Record<string, unknown> | undefined {
  if (!cd) return undefined;
  const out: Record<string, unknown> = {};
  if (cd.leadStatus) out.lead_status = cd.leadStatus;
  if (cd.qualification) out.qualification = cd.qualification;
  if (typeof cd.value === "number") out.value = cd.value;
  if (cd.currency) out.currency = cd.currency;
  if (cd.leadEventSource) out.lead_event_source = cd.leadEventSource;
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function sendMetaEvent(
  args: SendMetaEventArgs,
  config: MetaCapiConfig
): Promise<SendMetaEventResult> {
  if (!config.pixelId || !config.accessToken) {
    return {
      success: false,
      error: "Meta CAPI not configured (missing pixelId or accessToken)",
      testMode: false,
    };
  }

  const testMode = Boolean(config.testEventCode);

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: args.eventName,
        event_time: args.eventTime,
        event_id: args.eventId,
        action_source: args.actionSource ?? "system_generated",
        ...(args.eventSourceUrl ? { event_source_url: args.eventSourceUrl } : {}),
        user_data: buildUserData(args.userData),
        ...(buildCustomData(args.customData) ? { custom_data: buildCustomData(args.customData) } : {}),
      },
    ],
    ...(testMode ? { test_event_code: config.testEventCode } : {}),
  };

  const url = `https://graph.facebook.com/${META_API_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`;

  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      lastStatus = res.status;
      const text = await res.text();
      let body: any;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }

      if (res.ok) {
        return {
          success: true,
          fbTraceId: body?.fbtrace_id,
          testMode,
          httpStatus: res.status,
        };
      }

      lastError = body?.error?.message ?? `HTTP ${res.status}`;

      if (res.status >= 400 && res.status < 500) {
        return { success: false, error: lastError, testMode, httpStatus: res.status };
      }

      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
    }
  }

  return { success: false, error: lastError ?? "Unknown error", testMode, httpStatus: lastStatus };
}

export function buildDedupEventId(leadId: string, eventName: MetaEventName): string {
  return `${leadId}:${eventName}`;
}
