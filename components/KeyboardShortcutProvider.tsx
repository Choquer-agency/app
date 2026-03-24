"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import CommandPalette from "./CommandPalette";
import ShortcutHelpModal from "./ShortcutHelpModal";

interface KeyboardShortcutContextValue {
  registerShortcut: (id: string, handler: () => void) => void;
  unregisterShortcut: (id: string) => void;
  openCommandPalette: () => void;
  isCommandPaletteOpen: boolean;
}

const KeyboardShortcutContext = createContext<KeyboardShortcutContextValue | null>(null);

export function useKeyboardShortcuts() {
  const ctx = useContext(KeyboardShortcutContext);
  if (!ctx) throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutProvider");
  return ctx;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute("role") === "textbox") return true;
  // Check parent for Tiptap editor
  if (el.closest(".tiptap") || el.closest("[contenteditable]")) return true;
  return false;
}

export default function KeyboardShortcutProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const shortcutsRef = useRef<Map<string, () => void>>(new Map());

  const registerShortcut = useCallback((id: string, handler: () => void) => {
    shortcutsRef.current.set(id, handler);
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    shortcutsRef.current.delete(id);
  }, []);

  const openCommandPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K — always fires (toggle palette)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Escape — close palette or help
      if (e.key === "Escape") {
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
      }

      // Don't fire shortcuts when palette/help is open or in editable targets
      if (paletteOpen || helpOpen) return;
      if (isEditableTarget(e.target)) return;

      // ? — show shortcut help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      // Dispatch registered context-specific shortcuts
      const handler = shortcutsRef.current.get(e.key.toLowerCase());
      if (handler) {
        e.preventDefault();
        handler();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paletteOpen, helpOpen]);

  return (
    <KeyboardShortcutContext.Provider
      value={{
        registerShortcut,
        unregisterShortcut,
        openCommandPalette,
        isCommandPaletteOpen: paletteOpen,
      }}
    >
      {children}
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </KeyboardShortcutContext.Provider>
  );
}
