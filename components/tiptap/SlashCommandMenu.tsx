"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Editor, Range } from "@tiptap/core";
import type { SlashCommandItem } from "./SlashCommand";

interface MenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  editor: Editor;
  range: Range;
}

export interface SlashMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandMenu = forwardRef<SlashMenuHandle, MenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => setSelectedIndex(0), [items]);

    const grouped = useMemo(() => {
      const map = new Map<string, SlashCommandItem[]>();
      for (const item of items) {
        if (!map.has(item.group)) map.set(item.group, []);
        map.get(item.group)!.push(item);
      }
      return [...map.entries()];
    }, [items]);

    // Flat index → keep arrow nav simple even with groups
    const flat = items;

    useLayoutEffect(() => {
      if (!listRef.current) return;
      const active = listRef.current.querySelector<HTMLButtonElement>(
        `[data-slash-index="${selectedIndex}"]`
      );
      active?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + flat.length - 1) % flat.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % flat.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = flat[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="tiptap-slash-menu">
          <div className="tiptap-slash-empty">No matches</div>
        </div>
      );
    }

    let runningIndex = -1;

    return (
      <div className="tiptap-slash-menu" ref={listRef}>
        {grouped.map(([group, groupItems]) => (
          <div key={group}>
            <div className="tiptap-slash-group">{group}</div>
            {groupItems.map((item) => {
              runningIndex += 1;
              const idx = runningIndex;
              return (
                <button
                  key={item.title}
                  data-slash-index={idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    command(item);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`tiptap-slash-item ${
                    idx === selectedIndex ? "is-active" : ""
                  }`}
                >
                  <span className="tiptap-slash-icon">{item.icon}</span>
                  <span className="tiptap-slash-text">
                    <span className="tiptap-slash-title">{item.title}</span>
                    <span className="tiptap-slash-desc">{item.description}</span>
                  </span>
                  {item.shortcut && (
                    <span className="tiptap-slash-shortcut">{item.shortcut}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
);

SlashCommandMenu.displayName = "SlashCommandMenu";
export default SlashCommandMenu;
