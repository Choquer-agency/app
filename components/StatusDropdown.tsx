"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { TicketStatus } from "@/types";
import TicketStatusBadge, { STATUS_ORDER, getStatusLabel, getStatusDotColor } from "./TicketStatusBadge";

function measureZoom(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:-9999px;left:-9999px;width:100px;height:1px;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const z = probe.getBoundingClientRect().width / 100 || 1;
  document.body.removeChild(probe);
  return z;
}

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
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Re-measure after render and snap menu flush to button
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !buttonRef.current) return;
    const zoom = measureZoom();
    const btnRect = buttonRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const menuW = menuRect.width / zoom;
    const menuH = menuRect.height / zoom;

    let left = btnRect.left / zoom;
    if (left + menuW > window.innerWidth / zoom - 8) {
      left = btnRect.right / zoom - menuW;
    }
    if (left < 8) left = 8;

    let top = btnRect.bottom / zoom + 4;
    if (top + menuH > window.innerHeight / zoom - 8) {
      top = btnRect.top / zoom - menuH - 4;
      if (top < 8) top = 8;
    }
    if (top !== pos.top || left !== pos.left) setPos({ top, left });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const zoom = measureZoom();
      const menuWidth = 180;
      const menuHeight = 260; // ~7 items × 36px + padding
      let left = rect.left / zoom;
      if (left + menuWidth > window.innerWidth / zoom - 8) {
        left = rect.right / zoom - menuWidth;
      }
      if (left < 8) left = 8;

      let top = rect.bottom / zoom + 4;
      if (top + menuHeight > window.innerHeight / zoom - 8) {
        top = rect.top / zoom - menuHeight - 4;
        if (top < 8) top = 8;
      }
      setPos({ top, left });
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
            className="bg-white border border-[var(--border)] rounded-lg shadow-xl py-1"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
              minWidth: 180,
              width: "max-content",
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
