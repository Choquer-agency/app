/**
 * Converts TipTap JSON document structure to markdown text.
 * Mirrors the inverse of `markdown-to-tiptap.ts` so the round-trip is lossless
 * for the subset of features used in SEO strategy notes:
 * headings, paragraphs, bold/italic/strike/code/link marks,
 * bullet/ordered lists, task lists, blockquotes, code blocks, horizontal rules,
 * tables, images, mentions.
 */

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Mark[];
  text?: string;
}

function applyMarks(text: string, marks: Mark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `**${out}**`;
        break;
      case "italic":
        out = `*${out}*`;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "code":
        out = `\`${out}\``;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "link": {
        const href = (mark.attrs?.href as string) || "";
        out = `[${out}](${href})`;
        break;
      }
    }
  }
  return out;
}

function inlineToMarkdown(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += applyMarks(node.text || "", node.marks);
    } else if (node.type === "hardBreak") {
      out += "  \n";
    } else if (node.type === "mention") {
      const label = (node.attrs?.label as string) || (node.attrs?.id as string) || "";
      out += `@${label}`;
    } else if (node.type === "image") {
      const src = (node.attrs?.src as string) || "";
      const alt = (node.attrs?.alt as string) || "";
      out += `![${alt}](${src})`;
    }
  }
  return out;
}

function blockToMarkdown(node: TiptapNode, depth = 0): string {
  switch (node.type) {
    case "doc":
      return (node.content || []).map((n) => blockToMarkdown(n, depth)).join("\n\n");

    case "paragraph": {
      const text = inlineToMarkdown(node.content);
      return text;
    }

    case "heading": {
      const level = (node.attrs?.level as number) || 1;
      const hash = "#".repeat(Math.min(Math.max(level, 1), 6));
      return `${hash} ${inlineToMarkdown(node.content)}`;
    }

    case "blockquote":
      return (node.content || [])
        .map((n) => blockToMarkdown(n, depth))
        .join("\n\n")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");

    case "horizontalRule":
      return "---";

    case "codeBlock": {
      const lang = (node.attrs?.language as string) || "";
      const text = (node.content || []).map((n) => n.text || "").join("");
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }

    case "bulletList":
    case "orderedList": {
      const ordered = node.type === "orderedList";
      const items = node.content || [];
      return items
        .map((item, idx) => listItemToMarkdown(item, depth, ordered ? idx + 1 : null))
        .join("\n");
    }

    case "taskList": {
      const items = node.content || [];
      return items.map((item) => taskItemToMarkdown(item, depth)).join("\n");
    }

    case "image": {
      const src = (node.attrs?.src as string) || "";
      const alt = (node.attrs?.alt as string) || "";
      return `![${alt}](${src})`;
    }

    case "table":
      return tableToMarkdown(node);

    default:
      if (node.content) {
        return (node.content || []).map((n) => blockToMarkdown(n, depth)).join("\n\n");
      }
      return "";
  }
}

function listItemToMarkdown(item: TiptapNode, depth: number, ordered: number | null): string {
  const marker = ordered != null ? `${ordered}.` : "-";
  const indent = "  ".repeat(depth);
  const blocks = item.content || [];
  const lines: string[] = [];

  blocks.forEach((block, idx) => {
    if (block.type === "paragraph") {
      const text = inlineToMarkdown(block.content);
      if (idx === 0) lines.push(`${indent}${marker} ${text}`);
      else lines.push(`${indent}  ${text}`);
    } else if (block.type === "bulletList" || block.type === "orderedList") {
      lines.push(blockToMarkdown(block, depth + 1));
    } else if (block.type === "taskList") {
      lines.push(blockToMarkdown(block, depth + 1));
    } else {
      const rendered = blockToMarkdown(block, depth + 1);
      if (rendered) lines.push(`${indent}  ${rendered}`);
    }
  });

  return lines.join("\n");
}

function taskItemToMarkdown(item: TiptapNode, depth: number): string {
  const checked = (item.attrs?.checked as boolean) ? "x" : " ";
  const indent = "  ".repeat(depth);
  const blocks = item.content || [];
  const lines: string[] = [];

  blocks.forEach((block, idx) => {
    if (block.type === "paragraph") {
      const text = inlineToMarkdown(block.content);
      if (idx === 0) lines.push(`${indent}- [${checked}] ${text}`);
      else lines.push(`${indent}  ${text}`);
    } else if (
      block.type === "bulletList" ||
      block.type === "orderedList" ||
      block.type === "taskList"
    ) {
      lines.push(blockToMarkdown(block, depth + 1));
    } else {
      const rendered = blockToMarkdown(block, depth + 1);
      if (rendered) lines.push(`${indent}  ${rendered}`);
    }
  });

  return lines.join("\n");
}

function tableToMarkdown(table: TiptapNode): string {
  const rows = table.content || [];
  if (rows.length === 0) return "";

  const renderedRows = rows.map((row) =>
    (row.content || []).map((cell) => inlineToMarkdown(cell.content?.flatMap((p) => p.content || [])).replace(/\|/g, "\\|"))
  );

  const colCount = Math.max(...renderedRows.map((r) => r.length));
  const lines: string[] = [];
  renderedRows.forEach((cells, idx) => {
    while (cells.length < colCount) cells.push("");
    lines.push(`| ${cells.join(" | ")} |`);
    if (idx === 0) {
      lines.push(`| ${Array(colCount).fill("---").join(" | ")} |`);
    }
  });

  return lines.join("\n");
}

export function tiptapToMarkdown(input: string | TiptapNode): string {
  let doc: TiptapNode;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input);
    } catch {
      return input;
    }
  } else {
    doc = input;
  }
  if (!doc || typeof doc !== "object") return "";
  return blockToMarkdown(doc).trim();
}
