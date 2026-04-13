import type { Destination, DestinationContext, PushResult, TabularPayload } from "./types";
import { DestinationError } from "./types";

interface NotionConfig {
  databaseId: string;
  writeMode: "append";
  /** Optional map of payload column name → Notion property name, when they differ. */
  columnMap?: Record<string, string>;
  /** Optional name of the column (from payload.schema) to use as the row title.
   *  Defaults to the first string column. */
  titleColumn?: string;
}

export const notionDestination: Destination<NotionConfig> = {
  type: "notion",

  validate(raw) {
    const r = raw as Partial<NotionConfig> | undefined;
    if (!r || typeof r !== "object") return { ok: false, error: "config must be an object" };
    if (!r.databaseId) return { ok: false, error: "databaseId required" };
    return {
      ok: true,
      config: {
        databaseId: r.databaseId,
        writeMode: "append",
        columnMap: r.columnMap,
        titleColumn: r.titleColumn,
      },
    };
  },

  async test(ctx: DestinationContext) {
    const cfg = ctx.config as NotionConfig;
    if (!ctx.getNotionToken) {
      return { ok: false, error: "Notion API token not available" };
    }
    const token = await ctx.getNotionToken();
    const res = await fetch(`https://api.notion.com/v1/databases/${cfg.databaseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Notion returned ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  },

  async push(ctx: DestinationContext, payload: TabularPayload): Promise<PushResult> {
    const cfg = ctx.config as NotionConfig;
    if (!ctx.getNotionToken) {
      throw new DestinationError("Notion API token not available", "auth_failed");
    }
    const token = await ctx.getNotionToken();

    // Discover the DB schema once so we know property types
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${cfg.databaseId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
    });
    if (!dbRes.ok) {
      throw new DestinationError(`Notion DB fetch failed: ${dbRes.status}`, "not_found");
    }
    const db = (await dbRes.json()) as {
      properties: Record<string, { type: string; id: string }>;
    };
    const props = db.properties;

    // Find the title property name (there's always exactly one)
    const titleProp = Object.entries(props).find(([, p]) => p.type === "title")?.[0];
    if (!titleProp) {
      throw new DestinationError("Notion database has no title property", "invalid_config");
    }

    // Column name in payload → Notion property name
    const mapName = (payloadCol: string): string => cfg.columnMap?.[payloadCol] ?? payloadCol;

    // Which payload column powers the title?
    const titleSourceCol =
      cfg.titleColumn ??
      payload.schema.find((c) => c.type === "string")?.name ??
      payload.schema[0]?.name;

    let rowsWritten = 0;
    const concurrency = 4;
    const queue = [...payload.rows];

    const worker = async () => {
      while (queue.length) {
        const row = queue.shift();
        if (!row) break;
        const properties: Record<string, unknown> = {};

        // Title
        const titleVal = titleSourceCol != null ? row[titleSourceCol] : null;
        properties[titleProp] = {
          title: [{ type: "text", text: { content: String(titleVal ?? "") } }],
        };

        // Other columns — only set if the corresponding Notion property exists
        for (const col of payload.schema) {
          if (col.name === titleSourceCol) continue;
          const targetName = mapName(col.name);
          const target = props[targetName];
          if (!target) continue; // skip unknown columns silently
          const value = row[col.name];
          properties[targetName] = toNotionProperty(target.type, col.type, value);
        }

        const res = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parent: { database_id: cfg.databaseId },
            properties,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new DestinationError(
            `Notion page create failed (${res.status}): ${body.slice(0, 300)}`,
            res.status === 429 ? "quota_exceeded" : "upstream_error"
          );
        }
        rowsWritten++;
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    return {
      rowsWritten,
      destinationRef: `https://www.notion.so/${cfg.databaseId.replace(/-/g, "")}`,
    };
  },
};

function toNotionProperty(
  notionType: string,
  sourceType: "string" | "number" | "date" | "boolean",
  value: string | number | boolean | null
): unknown {
  if (value == null || value === "") return { [notionType]: null };
  switch (notionType) {
    case "rich_text":
      return { rich_text: [{ type: "text", text: { content: String(value) } }] };
    case "number":
      return { number: typeof value === "number" ? value : Number(value) };
    case "date":
      return {
        date: { start: typeof value === "string" ? value : new Date(Number(value)).toISOString().slice(0, 10) },
      };
    case "checkbox":
      return { checkbox: Boolean(value) };
    case "select":
      return { select: { name: String(value) } };
    case "url":
      return { url: String(value) };
    case "email":
      return { email: String(value) };
    case "phone_number":
      return { phone_number: String(value) };
    default:
      // Fall back to stringifying into a rich_text — handles most misconfigurations
      return { rich_text: [{ type: "text", text: { content: String(value) } }] };
  }
}
