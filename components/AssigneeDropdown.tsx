"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { TicketAssignee, TeamMember } from "@/types";
import TicketAssigneeAvatars from "./TicketAssigneeAvatars";

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function AssigneeDropdown({
  ticketId,
  assignees,
  teamMembers,
  onToggle,
}: {
  ticketId: number;
  assignees: TicketAssignee[];
  teamMembers: TeamMember[];
  onToggle: (ticketId: number, memberId: number, action: "add" | "remove") => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const assignedIds = new Set(assignees.map((a) => a.teamMemberId));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleScroll() { setOpen(false); }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
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
      <div
        ref={buttonRef}
        onClick={toggleOpen}
        className="cursor-pointer focus:outline-none"
      >
        <TicketAssigneeAvatars assignees={assignees} max={4} size="sm" />
      </div>
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
            {teamMembers.filter((m) => m.active).map((m) => {
              const isAssigned = assignedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(ticketId, m.id, isAssigned ? "remove" : "add");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-light)] transition flex items-center gap-2.5 ${
                    isAssigned ? "bg-[var(--accent-light)]" : ""
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden"
                    style={{
                      backgroundColor: m.color || "#e5e7eb",
                      color: m.color ? "#fff" : "#6b7280",
                    }}
                  >
                    {m.profilePicUrl ? (
                      <img src={m.profilePicUrl} alt={m.name} className="w-full h-full object-cover" />
                    ) : (
                      getInitials(m.name)
                    )}
                  </div>
                  <span className="flex-1">{m.name}</span>
                  {isAssigned && (
                    <svg className="w-4 h-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
