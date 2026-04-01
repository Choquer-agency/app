/**
 * Converts markdown text to TipTap-compatible JSON document structure.
 * Handles: headings, bold, italic, links, bullet lists, ordered lists, blockquotes, code blocks, inline code, horizontal rules.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Mark[];
  text?: string;
};

/** Parse inline markdown (bold, italic, links, inline code) into TipTap text nodes with marks */
function parseInline(text: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  // Regex for inline patterns: bold, italic, bold+italic, links, inline code
  const inlineRegex =
    /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) nodes.push({ type: "text", text: plain });
    }

    if (match[2]) {
      // ***bold italic***
      nodes.push({
        type: "text",
        text: match[2],
        marks: [{ type: "bold" }, { type: "italic" }],
      });
    } else if (match[3]) {
      // **bold**
      nodes.push({
        type: "text",
        text: match[3],
        marks: [{ type: "bold" }],
      });
    } else if (match[4]) {
      // *italic*
      nodes.push({
        type: "text",
        text: match[4],
        marks: [{ type: "italic" }],
      });
    } else if (match[5]) {
      // `inline code`
      nodes.push({
        type: "text",
        text: match[5],
        marks: [{ type: "code" }],
      });
    } else if (match[6] && match[7]) {
      // [link text](url)
      nodes.push({
        type: "text",
        text: match[6],
        marks: [{ type: "link", attrs: { href: match[7], target: "_blank" } }],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) nodes.push({ type: "text", text: remaining });
  }

  return nodes.length > 0 ? nodes : [];
}

/** Create a paragraph node from a line of text */
function makeParagraph(text: string): TiptapNode {
  const content = parseInline(text);
  return { type: "paragraph", content: content.length > 0 ? content : undefined };
}

/** Create a heading node */
function makeHeading(level: number, text: string): TiptapNode {
  const content = parseInline(text);
  return {
    type: "heading",
    attrs: { level },
    content: content.length > 0 ? content : undefined,
  };
}

export function markdownToTiptap(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  }

  const lines = markdown.split("\n");
  const nodes: TiptapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (```)
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push({
        type: "codeBlock",
        content: codeLines.length > 0
          ? [{ type: "text", text: codeLines.join("\n") }]
          : undefined,
      });
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      nodes.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    // Headings (# to ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      nodes.push(makeHeading(headingMatch[1].length, headingMatch[2].trim()));
      i++;
      continue;
    }

    // Blockquote (> ...)
    if (line.trimStart().startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("> ")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      nodes.push({
        type: "blockquote",
        content: quoteLines.map((ql) => makeParagraph(ql)),
      });
      continue;
    }

    // Unordered list (- or * )
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems: TiptapNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, "");
        listItems.push({
          type: "listItem",
          content: [makeParagraph(itemText)],
        });
        i++;
      }
      nodes.push({ type: "bulletList", content: listItems });
      continue;
    }

    // Ordered list (1. 2. etc)
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: TiptapNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, "");
        listItems.push({
          type: "listItem",
          content: [makeParagraph(itemText)],
        });
        i++;
      }
      nodes.push({ type: "orderedList", content: listItems });
      continue;
    }

    // Empty line → empty paragraph
    if (!line.trim()) {
      // Skip consecutive empty lines, just add one empty paragraph
      if (nodes.length > 0 && nodes[nodes.length - 1].type !== "paragraph") {
        nodes.push({ type: "paragraph" });
      }
      i++;
      continue;
    }

    // Regular paragraph
    nodes.push(makeParagraph(line));
    i++;
  }

  // Ensure at least one node
  if (nodes.length === 0) {
    nodes.push({ type: "paragraph" });
  }

  return JSON.stringify({ type: "doc", content: nodes });
}

/** Check if a string looks like it contains markdown formatting */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  // Check for common markdown patterns
  return /^#{1,3}\s|^\s*[-*]\s|\*\*[^*]+\*\*|^\s*>\s|^\s*\d+\.\s/.test(text) ||
    text.split("\n").some((line) => /^#{1,3}\s|^\s*[-*]\s|\*\*[^*]+\*\*|^\s*>\s/.test(line));
}
