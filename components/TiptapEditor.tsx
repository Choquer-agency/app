"use client";

import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Mention from "@tiptap/extension-mention";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { useEffect, useCallback, useRef, useState, forwardRef, useImperativeHandle } from "react";

interface MentionItem {
  id: string;
  label: string;
  profilePicUrl?: string;
  color?: string;
}

interface TiptapEditorProps {
  content?: string;
  onChange?: (json: string) => void;
  editable?: boolean;
  placeholder?: string;
  compact?: boolean;
  onSubmit?: () => void;
  className?: string;
  contentRef?: React.MutableRefObject<string>;
  mentionItems?: MentionItem[];
}

// Mention suggestion list component
const MentionList = forwardRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }, {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }
      if (event.key === "Enter") {
        if (props.items[selectedIndex]) {
          props.command(props.items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-white border border-[var(--border)] rounded-lg shadow-xl py-1 w-[220px] max-h-[200px] overflow-y-auto z-[9999]">
      {props.items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[var(--muted)]">No results</div>
      ) : (
        props.items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => props.command(item)}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition flex items-center gap-2.5 ${
              index === selectedIndex ? "bg-[var(--accent-light)]" : ""
            }`}
          >
            {item.profilePicUrl ? (
              <img src={item.profilePicUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: item.color || "#6b7280" }}
              >
                {item.label.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
              </div>
            )}
            <span>{item.label}</span>
          </button>
        ))
      )}
    </div>
  );
});
MentionList.displayName = "MentionList";

export default function TiptapEditor({
  content = "",
  onChange,
  editable = true,
  placeholder = "Start typing...",
  compact = false,
  onSubmit,
  className = "",
  contentRef,
  mentionItems = [],
}: TiptapEditorProps) {
  const isInitialized = useRef(false);
  const mentionOpenRef = useRef(false);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const textColorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const handleImagePaste = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/admin/tickets/upload-image", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.url;
      } catch {
        return null;
      }
    },
    []
  );

  // no-op — positioning handled in onStart/onUpdate directly


  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            const level = node.attrs.level;
            return `Heading ${level}`;
          }
          return placeholder;
        },
        includeChildren: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "tiptap-link" },
      }),
      Image.configure({ inline: true }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Mention.configure({
        HTMLAttributes: { class: "tiptap-mention" },
        suggestion: {
          items: ({ query }: { query: string }) => {
            return mentionItems
              .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 5);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          render: () => {
            let component: any;
            let container: HTMLDivElement;

            return {
              onStart: (props: any) => {
                mentionOpenRef.current = true;
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                container = document.createElement("div");
                container.style.position = "absolute";
                container.style.zIndex = "99999";
                container.style.bottom = "100%";
                container.style.left = "0";
                container.style.marginBottom = "4px";
                container.appendChild(component.element);

                const editorWrapper = (props.editor as any).view.dom.closest(".tiptap-wrapper");
                if (editorWrapper) {
                  editorWrapper.style.position = "relative";
                  editorWrapper.style.overflow = "visible";
                  editorWrapper.appendChild(container);
                }
              },
              onUpdate: (props: any) => {
                component.updateProps(props);
              },
              onKeyDown: (props: any) => {
                if (props.event.key === "Escape") {
                  container.remove();
                  return true;
                }
                return component.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                mentionOpenRef.current = false;
                container.remove();
                component.destroy();
              },
            };
          },
        },
      }),
    ],
    content: parseContent(content),
    editable,
    editorProps: {
      attributes: {
        class: `tiptap-content ${compact ? "tiptap-compact" : ""} ${
          !editable ? "tiptap-readonly" : ""
        }`,
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) return true;

            // Insert placeholder
            const { tr } = view.state;
            const placeholderText = view.state.schema.text("Uploading image...");
            const placeholderPos = tr.selection.from;
            view.dispatch(tr.insertText("Uploading image..."));

            handleImagePaste(file).then((url) => {
              if (url && editor) {
                // Remove placeholder and insert image
                const { tr: tr2 } = editor.view.state;
                tr2.delete(placeholderPos, placeholderPos + "Uploading image...".length);
                editor.view.dispatch(tr2);
                editor.chain().focus().setImage({ src: url }).run();
              }
            });

            return true;
          }
        }
        return false;
      },
      handleKeyDown: compact && onSubmit
        ? (_view, event) => {
            if (event.key === "Enter" && !event.shiftKey && !mentionOpenRef.current) {
              event.preventDefault();
              onSubmit();
              return true;
            }
            return false;
          }
        : undefined,
    },
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON());
      onChange?.(json);
      if (contentRef) contentRef.current = json;
    },
  });

  // Update content when prop changes (but not on first render)
  useEffect(() => {
    if (!editor) return;
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }
    const parsed = parseContent(content);
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(parsed);
    if (current !== incoming) {
      editor.commands.setContent(parsed);
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  // Close color dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (textColorRef.current && !textColorRef.current.contains(e.target as Node)) {
        setShowTextColor(false);
      }
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) {
        setShowHighlight(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!editor) return null;

  const TEXT_COLORS = [
    { name: "Default", color: null },
    { name: "Black", color: "#000000" },
    { name: "Dark Gray", color: "#4B5563" },
    { name: "Gray", color: "#9CA3AF" },
    { name: "Red", color: "#EF4444" },
    { name: "Orange", color: "#F97316" },
    { name: "Amber", color: "#F59E0B" },
    { name: "Yellow", color: "#EAB308" },
    { name: "Green", color: "#22C55E" },
    { name: "Teal", color: "#14B8A6" },
    { name: "Blue", color: "#3B82F6" },
    { name: "Indigo", color: "#6366F1" },
    { name: "Purple", color: "#A855F7" },
    { name: "Pink", color: "#EC4899" },
    { name: "Rose", color: "#F43F5E" },
  ];

  const HIGHLIGHT_COLORS = [
    { name: "Default", color: null },
    { name: "Yellow", color: "#FEF08A" },
    { name: "Green", color: "#BBF7D0" },
    { name: "Blue", color: "#BFDBFE" },
    { name: "Purple", color: "#E9D5FF" },
    { name: "Pink", color: "#FBCFE8" },
    { name: "Red", color: "#FECACA" },
    { name: "Orange", color: "#FED7AA" },
    { name: "Teal", color: "#CCFBF1" },
    { name: "Gray", color: "#E5E7EB" },
  ];

  return (
    <div className={`tiptap-wrapper ${className}`}>
      {editable && !compact && editor && (
        <BubbleMenu
          editor={editor}
          className="tiptap-bubble-menu"
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive("bold") ? "is-active" : ""}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive("italic") ? "is-active" : ""}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive("underline") ? "is-active" : ""}
            title="Underline"
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive("strike") ? "is-active" : ""}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={editor.isActive("code") ? "is-active" : ""}
            title="Code"
          >
            {"</>"}
          </button>
          <span className="tiptap-separator" />
          {/* Text Color */}
          <div ref={textColorRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => { setShowTextColor(!showTextColor); setShowHighlight(false); }}
              className={editor.isActive("textStyle") ? "is-active" : ""}
              title="Text Color"
              style={{ position: "relative" }}
            >
              <span style={{ borderBottom: `3px solid ${editor.getAttributes("textStyle").color || "var(--foreground)"}`, lineHeight: 1, paddingBottom: 1, fontWeight: 700, fontSize: 12 }}>A</span>
            </button>
            {showTextColor && (
              <div className="tiptap-color-dropdown">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    className={`tiptap-color-swatch ${!c.color && !editor.getAttributes("textStyle").color ? "is-active" : c.color && editor.getAttributes("textStyle").color === c.color ? "is-active" : ""}`}
                    onClick={() => {
                      if (c.color) {
                        editor.chain().focus().setColor(c.color).run();
                      } else {
                        editor.chain().focus().unsetColor().run();
                      }
                      setShowTextColor(false);
                    }}
                  >
                    {c.color ? (
                      <span style={{ background: c.color, width: 18, height: 18, borderRadius: "50%", display: "block", border: "1px solid rgba(0,0,0,0.1)" }} />
                    ) : (
                      <span style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #d1d5db", fontSize: 10, color: "#9CA3AF" }}>&#x2215;</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Highlight Color */}
          <div ref={highlightRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => { setShowHighlight(!showHighlight); setShowTextColor(false); }}
              className={editor.isActive("highlight") ? "is-active" : ""}
              title="Highlight"
            >
              <span style={{ background: editor.getAttributes("highlight").color || "#FEF08A", borderRadius: 2, padding: "0 3px", fontWeight: 700, fontSize: 12, lineHeight: 1 }}>H</span>
            </button>
            {showHighlight && (
              <div className="tiptap-color-dropdown">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    className={`tiptap-color-swatch ${!c.color && !editor.isActive("highlight") ? "is-active" : c.color && editor.isActive("highlight", { color: c.color }) ? "is-active" : ""}`}
                    onClick={() => {
                      if (c.color) {
                        editor.chain().focus().toggleHighlight({ color: c.color }).run();
                      } else {
                        editor.chain().focus().unsetHighlight().run();
                      }
                      setShowHighlight(false);
                    }}
                  >
                    {c.color ? (
                      <span style={{ background: c.color, width: 18, height: 18, borderRadius: "50%", display: "block", border: "1px solid rgba(0,0,0,0.1)" }} />
                    ) : (
                      <span style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #d1d5db", fontSize: 10, color: "#9CA3AF" }}>&#x2215;</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="tiptap-separator" />
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className={
              editor.isActive("heading", { level: 1 }) ? "is-active" : ""
            }
            title="Heading 1"
          >
            H1
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={
              editor.isActive("heading", { level: 2 }) ? "is-active" : ""
            }
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className={
              editor.isActive("heading", { level: 3 }) ? "is-active" : ""
            }
            title="Heading 3"
          >
            H3
          </button>
          <span className="tiptap-separator" />
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive("bulletList") ? "is-active" : ""}
            title="Bullet List"
          >
            &bull;
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive("orderedList") ? "is-active" : ""}
            title="Numbered List"
          >
            1.
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={editor.isActive("taskList") ? "is-active" : ""}
            title="Task List"
          >
            &#9745;
          </button>
          <span className="tiptap-separator" />
          <button
            type="button"
            onClick={() => {
              const url = window.prompt("Enter URL:");
              if (url) {
                editor
                  .chain()
                  .focus()
                  .setLink({ href: url })
                  .run();
              }
            }}
            className={editor.isActive("link") ? "is-active" : ""}
            title="Link"
          >
            &#128279;
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={editor.isActive("codeBlock") ? "is-active" : ""}
            title="Code Block"
          >
            {"{ }"}
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />

      <style jsx global>{`
        .tiptap-wrapper {
          position: relative;
        }

        .tiptap-wrapper .ProseMirror {
          max-height: none !important;
          overflow: visible !important;
          height: auto !important;
        }

        .tiptap-content {
          outline: none;
          font-size: 0.875rem;
          line-height: 1.6;
          color: var(--foreground);
          min-height: ${compact ? "36px" : "60px"};
          max-height: ${compact ? "200px" : "none"};
          overflow-y: ${compact ? "auto" : "visible"};
          overflow-x: hidden;
          padding: ${compact ? "6px 10px" : "0"};
        }

        .tiptap-compact .ProseMirror {
          max-height: 200px !important;
          overflow-y: auto !important;
        }

        .tiptap-compact {
          font-size: 0.8125rem;
        }

        .tiptap-readonly {
          cursor: default;
        }

        .tiptap-content p {
          margin: 0.25em 0;
        }

        .tiptap-content h1 {
          font-size: 1.875em;
          font-weight: 700;
          margin: 1em 0 0.25em;
          line-height: 1.3;
        }

        .tiptap-content h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin: 0.8em 0 0.2em;
          line-height: 1.35;
        }

        .tiptap-content h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0.6em 0 0.15em;
          line-height: 1.4;
        }

        .tiptap-content ul,
        .tiptap-content ol {
          padding-left: 1.5em;
          margin: 0.3em 0;
        }

        .tiptap-content ul {
          list-style: disc;
        }

        .tiptap-content ol {
          list-style: decimal;
        }

        .tiptap-content li {
          margin: 0.1em 0;
        }

        .tiptap-content ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }

        .tiptap-content ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5em;
        }

        .tiptap-content ul[data-type="taskList"] li label {
          flex-shrink: 0;
          margin-top: 0.15em;
        }

        .tiptap-content ul[data-type="taskList"] li label input[type="checkbox"] {
          accent-color: var(--accent);
          width: 14px;
          height: 14px;
          cursor: pointer;
        }

        .tiptap-content ul[data-type="taskList"] li > div {
          flex: 1;
        }

        .tiptap-content blockquote {
          border-left: 3px solid var(--border);
          padding-left: 1em;
          margin: 0.5em 0;
          color: var(--muted);
        }

        .tiptap-content code {
          background: #f3f4f6;
          padding: 0.15em 0.35em;
          border-radius: 4px;
          font-size: 0.85em;
          font-family: ui-monospace, monospace;
        }

        .tiptap-content pre {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 0.75em 1em;
          border-radius: 6px;
          margin: 0.5em 0;
          overflow-x: auto;
        }

        .tiptap-content pre code {
          background: transparent;
          padding: 0;
          color: inherit;
        }

        .tiptap-content a,
        .tiptap-content .tiptap-link {
          color: var(--accent);
          text-decoration: underline;
          cursor: pointer;
        }

        .tiptap-content img {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          margin: 0.5em 0;
        }

        .tiptap-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
        }

        .tiptap-content th,
        .tiptap-content td {
          border: 1px solid var(--border);
          padding: 0.4em 0.6em;
          text-align: left;
        }

        .tiptap-content th {
          background: #f9fafb;
          font-weight: 600;
        }

        .tiptap-content hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 1em 0;
        }

        .tiptap-mention {
          background: var(--accent-light, #fef3e2);
          color: var(--accent, #e8772e);
          border-radius: 4px;
          padding: 1px 4px;
          font-weight: 500;
          font-size: 0.9em;
        }

        .tiptap-content p.is-editor-empty:first-child::before,
        .tiptap-content h1.is-empty::before,
        .tiptap-content h2.is-empty::before,
        .tiptap-content h3.is-empty::before {
          content: attr(data-placeholder);
          color: #d1d5db;
          pointer-events: none;
          float: left;
          height: 0;
        }

        /* Bubble Menu */
        .tiptap-bubble-menu {
          display: flex;
          align-items: center;
          gap: 2px;
          background: white;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 4px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }

        .tiptap-bubble-menu button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          color: var(--foreground);
          transition: background 0.15s;
        }

        .tiptap-bubble-menu button:hover {
          background: #f3f4f6;
        }

        .tiptap-bubble-menu button.is-active {
          background: var(--accent-light);
          color: var(--accent);
        }

        .tiptap-separator {
          width: 1px;
          height: 20px;
          background: var(--border);
          margin: 0 2px;
        }

        .tiptap-color-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: white;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
          z-index: 100;
          width: max-content;
        }

        .tiptap-color-swatch {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 28px !important;
          height: 28px !important;
          border-radius: 6px !important;
          border: none !important;
          background: transparent !important;
          cursor: pointer !important;
          padding: 0 !important;
          transition: transform 0.1s !important;
        }

        .tiptap-color-swatch:hover {
          transform: scale(1.15) !important;
          background: #f3f4f6 !important;
        }

        .tiptap-color-swatch.is-active {
          outline: 2px solid var(--accent) !important;
          outline-offset: 1px;
          border-radius: 50% !important;
        }

        .tiptap-content mark {
          border-radius: 2px;
          padding: 1px 0;
        }
      `}</style>
    </div>
  );
}

function parseContent(content: string): Record<string, unknown> | string {
  if (!content) return { type: "doc", content: [{ type: "paragraph" }] };
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed;
    }
    // Not tiptap JSON — treat as plain text
    return plainToTiptap(content);
  } catch {
    // Plain text string
    return plainToTiptap(content);
  }
}

function plainToTiptap(text: string): Record<string, unknown> {
  if (!text || !text.trim()) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  const paragraphs = text.split("\n").map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return { type: "doc", content: paragraphs };
}
