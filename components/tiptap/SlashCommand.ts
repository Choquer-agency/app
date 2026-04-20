import { Editor, Extension, Range } from "@tiptap/core";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";

export interface SlashCommandItem {
  title: string;
  description: string;
  keywords: string[];
  group: "Basic" | "Headings" | "Lists" | "Media" | "Inline" | "Advanced";
  icon: string;
  shortcut?: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

export interface SlashCommandOptions {
  suggestion: Omit<SuggestionOptions<SlashCommandItem>, "editor">;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export function defaultSlashItems(opts: {
  uploadImage?: () => void;
}): SlashCommandItem[] {
  return [
    // ─── Basic ──────────────────────────────────────────────
    {
      title: "Text",
      description: "Plain paragraph text",
      keywords: ["text", "paragraph", "p", "plain"],
      group: "Basic",
      icon: "T",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
    },
    {
      title: "To-do list",
      description: "Checkbox list",
      keywords: ["todo", "task", "checkbox", "check"],
      group: "Basic",
      icon: "☑",
      shortcut: "[]",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: "Bullet list",
      description: "Simple bulleted list",
      keywords: ["bullet", "list", "ul", "unordered"],
      group: "Lists",
      icon: "•",
      shortcut: "- ",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      description: "Ordered list",
      keywords: ["number", "ordered", "ol", "1"],
      group: "Lists",
      icon: "1.",
      shortcut: "1. ",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: "Quote",
      description: "Highlight a quote",
      keywords: ["quote", "blockquote", "citation"],
      group: "Basic",
      icon: "❝",
      shortcut: "> ",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: "Divider",
      description: "Visual separator",
      keywords: ["divider", "hr", "separator", "rule", "line"],
      group: "Basic",
      icon: "—",
      shortcut: "---",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },

    // ─── Headings ───────────────────────────────────────────
    {
      title: "Heading 1",
      description: "Big section heading",
      keywords: ["h1", "heading", "title", "large"],
      group: "Headings",
      icon: "H1",
      shortcut: "# ",
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 1 })
          .run(),
    },
    {
      title: "Heading 2",
      description: "Medium section heading",
      keywords: ["h2", "heading", "subtitle"],
      group: "Headings",
      icon: "H2",
      shortcut: "## ",
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 2 })
          .run(),
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      keywords: ["h3", "heading"],
      group: "Headings",
      icon: "H3",
      shortcut: "### ",
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 3 })
          .run(),
    },

    // ─── Media ──────────────────────────────────────────────
    ...(opts.uploadImage
      ? [
          {
            title: "Image",
            description: "Upload from your computer",
            keywords: ["image", "picture", "photo", "upload"],
            group: "Media" as const,
            icon: "🖼",
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
              editor.chain().focus().deleteRange(range).run();
              opts.uploadImage!();
            },
          },
        ]
      : []),
    {
      title: "Link",
      description: "Add a hyperlink",
      keywords: ["link", "url", "href"],
      group: "Inline",
      icon: "🔗",
      command: ({ editor, range }) => {
        const url = window.prompt("Enter URL:");
        editor.chain().focus().deleteRange(range).run();
        if (url) editor.chain().focus().setLink({ href: url }).run();
      },
    },
    {
      title: "Code block",
      description: "Capture a code snippet",
      keywords: ["code", "snippet", "pre"],
      group: "Advanced",
      icon: "{ }",
      shortcut: "```",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: "Table",
      description: "Insert a 3×3 table",
      keywords: ["table", "grid", "rows", "columns"],
      group: "Advanced",
      icon: "▦",
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ];
}

export function filterSlashItems(
  items: SlashCommandItem[],
  query: string
): SlashCommandItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.keywords.some((k) => k.toLowerCase().includes(q))
  );
}
