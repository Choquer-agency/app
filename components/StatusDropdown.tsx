"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { TicketStatus } from "@/types";
import TicketStatusBadge, { STATUS_ORDER, getStatusLabel, getStatusDotColor } from "./TicketStatusBadge";

export default function StatusDropdown({
  status,
  onChange,
  size = "xs",
}: {
  status: TicketStatus;
  onChange: (newStatus: TicketStatus) => void;
  size?: "xs" | "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      setPos({ top: rect.bottom / zoom + 4, left: rect.left / zoom });
    }
    setOpen(!open);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="cursor-pointer focus:outline-none"
      >
        <TicketStatusBadge status={status} size={size} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            className="bg-white border border-[var(--border)] rounded-lg shadow-xl py-0 overflow-hidden min-w-[220px]"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
          >
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(s);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-light)] transition flex items-center gap-2.5 ${
                  s === status ? "font-semibold bg-[var(--accent-light)]" : ""
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getStatusDotColor(s) }}
                />
                {getStatusLabel(s)}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
