"use client";

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_SECTIONS = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Open command palette" },
      { keys: ["Esc"], description: "Close modal / palette" },
      { keys: ["?"], description: "Show this help" },
    ],
  },
  {
    title: "Ticket List",
    shortcuts: [
      { keys: ["J"], description: "Move selection down" },
      { keys: ["K"], description: "Move selection up" },
      { keys: ["↵"], description: "Open selected ticket" },
      { keys: ["N"], description: "New ticket" },
      { keys: ["/"], description: "Focus search filter" },
    ],
  },
];

export default function ShortcutHelpModal({ isOpen, onClose }: ShortcutHelpModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="px-5 py-4 space-y-5">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-[var(--foreground)]">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-[24px] text-center text-xs px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono text-[var(--muted)]"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--border)] bg-gray-50/50">
          <p className="text-[10px] text-[var(--muted)]">
            Shortcuts are disabled when typing in input fields or the rich text editor.
          </p>
        </div>
      </div>
    </div>
  );
}
