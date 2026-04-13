import { google } from "googleapis";
import type { Destination, DestinationContext, PushResult, TabularPayload } from "./types";
import { DestinationError } from "./types";

interface SheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  writeMode: "replace" | "append";
}

function sheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

async function ensureSheetExists(
  sheets: ReturnType<typeof sheetsClient>,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
}

function toRows(payload: TabularPayload): string[][] {
  const header = payload.schema.map((c) => c.name);
  const body = payload.rows.map((r) =>
    payload.schema.map((c) => {
      const v = r[c.name];
      if (v == null) return "";
      return String(v);
    })
  );
  return [header, ...body];
}

export const sheetsDestination: Destination<SheetsConfig> = {
  type: "sheets",

  validate(raw) {
    const r = raw as Partial<SheetsConfig> | undefined;
    if (!r || typeof r !== "object") return { ok: false, error: "config must be an object" };
    if (!r.spreadsheetId) return { ok: false, error: "spreadsheetId required" };
    if (!r.sheetName) return { ok: false, error: "sheetName required" };
    const mode = r.writeMode ?? "replace";
    if (mode !== "replace" && mode !== "append") {
      return { ok: false, error: "writeMode must be 'replace' or 'append'" };
    }
    return {
      ok: true,
      config: { spreadsheetId: r.spreadsheetId, sheetName: r.sheetName, writeMode: mode },
    };
  },

  async test(ctx: DestinationContext) {
    const cfg = ctx.config as SheetsConfig;
    if (!ctx.getGoogleAccessToken) {
      return { ok: false, error: "Google access token not available" };
    }
    try {
      const token = await ctx.getGoogleAccessToken();
      const sheets = sheetsClient(token);
      const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.spreadsheetId });
      const tabs = (meta.data.sheets ?? [])
        .map((s) => s.properties?.title)
        .filter(Boolean)
        .join(", ");
      return { ok: true, error: `Found spreadsheet "${meta.data.properties?.title}" with tabs: ${tabs}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("insufficient_scope") || msg.includes("insufficientPermissions")) {
        return {
          ok: false,
          error: "Insufficient scope — reconnect Google at Settings → Connections to grant Sheets access.",
        };
      }
      return { ok: false, error: msg };
    }
  },

  async push(ctx: DestinationContext, payload: TabularPayload): Promise<PushResult> {
    const cfg = ctx.config as SheetsConfig;
    if (!ctx.getGoogleAccessToken) {
      throw new DestinationError("Google access token not available", "auth_failed");
    }
    const token = await ctx.getGoogleAccessToken();
    const sheets = sheetsClient(token);

    await ensureSheetExists(sheets, cfg.spreadsheetId, cfg.sheetName);

    const rows = toRows(payload);
    if (rows.length === 0) {
      return {
        rowsWritten: 0,
        destinationRef: `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}`,
      };
    }

    const rangeAll = `'${cfg.sheetName}'`;

    if (cfg.writeMode === "replace") {
      // Clear existing data + write header + rows
      await sheets.spreadsheets.values.clear({
        spreadsheetId: cfg.spreadsheetId,
        range: rangeAll,
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: cfg.spreadsheetId,
        range: `'${cfg.sheetName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      });
    } else {
      // Append — if the sheet is empty, write header first
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: cfg.spreadsheetId,
        range: `'${cfg.sheetName}'!A1:A1`,
      });
      const isEmpty = !existing.data.values || existing.data.values.length === 0;
      const toAppend = isEmpty ? rows : rows.slice(1); // skip header if sheet already has one
      if (toAppend.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: cfg.spreadsheetId,
          range: rangeAll,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: toAppend },
        });
      }
    }

    return {
      rowsWritten: payload.rows.length, // exclude header from the count we report
      destinationRef: `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}`,
    };
  },
};
