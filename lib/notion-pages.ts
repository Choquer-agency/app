import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any;

/**
 * Recursively fetch all blocks from a Notion page
 */
export async function getPageBlocks(pageId: string): Promise<Block[]> {
  const blocks: Block[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      const b = block as Block;
      // Recursively fetch children (for toggles, nested lists, etc.)
      if ("has_children" in b && b.has_children) {
        b._children = await getPageBlocks(b.id);
      }
      blocks.push(b);
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}

interface NotionRichText {
  plain_text: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
}

/**
 * Extract text from Notion rich text array, preserving formatting as markdown
 */
function richTextToMarkdown(richText: NotionRichText[]): string {
  return richText
    .map((t) => {
      let text = t.plain_text;
      if (t.annotations?.code) text = `\`${text}\``;
      if (t.annotations?.strikethrough) text = `~~${text}~~`;
      if (t.annotations?.italic) text = `*${text}*`;
      if (t.annotations?.bold) text = `**${text}**`;
      if (t.href) return `[${text}](${t.href})`;
      return text;
    })
    .join("");
}

/**
 * Convert Notion blocks to markdown
 */
export function blocksToMarkdown(blocks: Block[], depth = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);

  for (const block of blocks) {
    const type = block.type;

    switch (type) {
      case "heading_1":
        lines.push(`\n# ${richTextToMarkdown(block.heading_1.rich_text)}`);
        break;
      case "heading_2":
        lines.push(`\n## ${richTextToMarkdown(block.heading_2.rich_text)}`);
        break;
      case "heading_3":
        lines.push(`\n### ${richTextToMarkdown(block.heading_3.rich_text)}`);
        break;
      case "paragraph":
        const text = richTextToMarkdown(block.paragraph.rich_text);
        if (text) lines.push(`${indent}${text}`);
        break;
      case "bulleted_list_item":
        lines.push(`${indent}- ${richTextToMarkdown(block.bulleted_list_item.rich_text)}`);
        break;
      case "numbered_list_item":
        lines.push(`${indent}1. ${richTextToMarkdown(block.numbered_list_item.rich_text)}`);
        break;
      case "to_do":
        const checked = block.to_do.checked ? "[x]" : "[ ]";
        lines.push(`${indent}- ${checked} ${richTextToMarkdown(block.to_do.rich_text)}`);
        break;
      case "toggle":
        lines.push(`${indent}> ${richTextToMarkdown(block.toggle.rich_text)}`);
        break;
      case "quote":
        lines.push(`${indent}> ${richTextToMarkdown(block.quote.rich_text)}`);
        break;
      case "callout":
        const icon = block.callout.icon?.emoji || "";
        lines.push(`${indent}${icon} ${richTextToMarkdown(block.callout.rich_text)}`);
        break;
      case "divider":
        lines.push("---");
        break;
      case "bookmark":
        if (block.bookmark.url) lines.push(`${indent}[Bookmark](${block.bookmark.url})`);
        break;
      case "link_preview":
        if (block.link_preview.url) lines.push(`${indent}[Link](${block.link_preview.url})`);
        break;
      case "code":
        lines.push(`\`\`\`\n${richTextToMarkdown(block.code.rich_text)}\n\`\`\``);
        break;
      // Skip unsupported block types silently
    }

    // Render children if present
    if (block._children && block._children.length > 0) {
      lines.push(blocksToMarkdown(block._children, depth + 1));
    }
  }

  return lines.join("\n");
}

/**
 * Get full page content as markdown
 */
export async function getClientPageContent(pageId: string): Promise<string> {
  const blocks = await getPageBlocks(pageId);
  return blocksToMarkdown(blocks);
}

export interface TaskCompletion {
  completed: number;
  total: number;
}

/**
 * Count checked vs unchecked to_do blocks recursively
 */
export function countTaskCompletion(blocks: Block[]): TaskCompletion {
  let completed = 0;
  let total = 0;

  for (const block of blocks) {
    if (block.type === "to_do") {
      total++;
      if (block.to_do.checked) completed++;
    }
    if (block._children?.length) {
      const child = countTaskCompletion(block._children);
      completed += child.completed;
      total += child.total;
    }
  }

  return { completed, total };
}

/**
 * Get page content as both markdown and raw blocks
 */
export async function getClientPageData(pageId: string): Promise<{
  markdown: string;
  blocks: Block[];
}> {
  const blocks = await getPageBlocks(pageId);
  const markdown = blocksToMarkdown(blocks);
  return { markdown, blocks };
}

/**
 * All month names for matching
 */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Split markdown into current month section and the rest.
 * Handles multiple formats:
 *   - Headings: "# March 2026", "## March: Technical SEO"
 *   - Toggles/blockquotes: "> March: Technical SEO & On-Page"
 *   - With or without year
 */
export function splitByMonthSections(markdown: string): {
  currentMonthSection: string;
  rest: string;
} {
  const now = new Date();
  const currentMonthName = MONTH_NAMES[now.getMonth()];

  // Build patterns to find any month marker (heading, toggle/blockquote, or bold line)
  // Match lines like: "# March 2026", "## March: Technical SEO", "> March: On-Page", "**March**"
  const monthPattern = new RegExp(
    `^(?:#{1,3}\\s+|>\\s+|\\*\\*)(${MONTH_NAMES.join("|")})\\b[^\\n]*`,
    "gim"
  );

  // Find all month markers in the document
  const markers: Array<{ month: string; index: number; length: number }> = [];
  let m;
  while ((m = monthPattern.exec(markdown)) !== null) {
    markers.push({
      month: m[1],
      index: m.index,
      length: m[0].length,
    });
  }

  if (markers.length === 0) {
    // No month markers found — return everything
    return { currentMonthSection: markdown, rest: "" };
  }

  // Find the current month's marker
  const currentIdx = markers.findIndex(
    (mk) => mk.month.toLowerCase() === currentMonthName.toLowerCase()
  );

  if (currentIdx === -1) {
    // Current month not found — return everything
    return { currentMonthSection: markdown, rest: "" };
  }

  const startIdx = markers[currentIdx].index;

  // End at the next month marker, or end of document
  const endIdx = currentIdx + 1 < markers.length
    ? markers[currentIdx + 1].index
    : markdown.length;

  const currentMonthSection = markdown.slice(startIdx, endIdx).trim();
  const before = markdown.slice(0, startIdx).trim();
  const after = markdown.slice(endIdx).trim();
  const rest = [before, after].filter(Boolean).join("\n\n");

  return { currentMonthSection, rest };
}

/**
 * Count checked vs unchecked checkboxes in a markdown string.
 * Use this on a scoped section (e.g., current month only) for accurate counts.
 */
export function countCheckboxesInMarkdown(markdown: string): TaskCompletion {
  const checked = (markdown.match(/- \[x\]/g) || []).length;
  const unchecked = (markdown.match(/- \[ \]/g) || []).length;
  return { completed: checked, total: checked + unchecked };
}

/**
 * Get page title
 */
export async function getPageTitle(pageId: string): Promise<string> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (page as any).properties;
  if (props?.title?.title) {
    return props.title.title.map((t: { plain_text: string }) => t.plain_text).join("");
  }
  return "";
}
