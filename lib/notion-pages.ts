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

/**
 * Extract plain text from Notion rich text array
 */
function richTextToPlain(richText: Array<{ plain_text: string; href?: string | null }>): string {
  return richText
    .map((t) => {
      if (t.href) return `[${t.plain_text}](${t.href})`;
      return t.plain_text;
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
        lines.push(`\n# ${richTextToPlain(block.heading_1.rich_text)}`);
        break;
      case "heading_2":
        lines.push(`\n## ${richTextToPlain(block.heading_2.rich_text)}`);
        break;
      case "heading_3":
        lines.push(`\n### ${richTextToPlain(block.heading_3.rich_text)}`);
        break;
      case "paragraph":
        const text = richTextToPlain(block.paragraph.rich_text);
        if (text) lines.push(`${indent}${text}`);
        break;
      case "bulleted_list_item":
        lines.push(`${indent}- ${richTextToPlain(block.bulleted_list_item.rich_text)}`);
        break;
      case "numbered_list_item":
        lines.push(`${indent}1. ${richTextToPlain(block.numbered_list_item.rich_text)}`);
        break;
      case "to_do":
        const checked = block.to_do.checked ? "[x]" : "[ ]";
        lines.push(`${indent}- ${checked} ${richTextToPlain(block.to_do.rich_text)}`);
        break;
      case "toggle":
        lines.push(`${indent}> ${richTextToPlain(block.toggle.rich_text)}`);
        break;
      case "quote":
        lines.push(`${indent}> ${richTextToPlain(block.quote.rich_text)}`);
        break;
      case "callout":
        const icon = block.callout.icon?.emoji || "";
        lines.push(`${indent}${icon} ${richTextToPlain(block.callout.rich_text)}`);
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
        lines.push(`\`\`\`\n${richTextToPlain(block.code.rich_text)}\n\`\`\``);
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
