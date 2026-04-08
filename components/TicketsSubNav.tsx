"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import ProjectCreateFlow from "./ProjectCreateFlow";

interface SubNavProject {
  id: string;
  name: string;
  status: string;
  clientName?: string;
}

export default function TicketsSubNav() {
  const pathname = usePathname();
  const [showCompleted, setShowCompleted] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const { user, userId, roleLevel } = useCurrentUser();

  // Real-time project list
  const projectDocs = useQuery(
    api.projects.listByMember,
    userId ? { teamMemberId: userId as Id<"teamMembers"> } : "skip"
  );

  const projects: SubNavProject[] = useMemo(
    () =>
      projectDocs?.map((p: any) => ({
        id: p._id,
        name: p.name,
        status: p.status ?? "active",
        clientName: p.clientName,
      })) ?? [],
    [projectDocs]
  );

  const userTags = user?.tags ?? [];
  const userRole = roleLevel ?? "";

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCompleted(false);
      }
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    }
    if (showCompleted || showPlusMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCompleted, showPlusMenu]);

  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "on_hold");
  const completedProjects = projects.filter((p) => p.status === "completed");

  const isAdmin = ["owner", "c_suite"].includes(userRole);

  // Defer conditional tabs until after mount to avoid SSR hydration mismatch
  // (cookie is unreadable during SSR, so user/tags are null server-side)
  const fixedTabs = [
    { href: "/admin/tickets/my-board", label: "My Board" },
    { href: "/admin/tickets", label: "Task Management", exact: true },
    // SEO: visible to admins or team members tagged "SEO"
    ...(mounted && (isAdmin || userTags.includes("SEO"))
      ? [{ href: "/admin/tickets/seo", label: "SEO" }]
      : []),
    // Google Ads: visible to admins or team members tagged "Google Ads"
    ...(mounted && (isAdmin || userTags.includes("Google Ads"))
      ? [{ href: "/admin/tickets/google-ads", label: "Google Ads" }]
      : []),
    // Retainer: visible to everyone
    { href: "/admin/tickets/retainer", label: "Retainer" },
  ];

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const tabClass = (href: string, exact?: boolean) =>
    `whitespace-nowrap px-3 py-2 text-sm transition border-b-2 ${
      isActive(href, exact)
        ? "border-[var(--accent)] text-[var(--accent)] font-semibold"
        : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)] hover:border-gray-200"
    }`;

  return (
    <div className="border-b border-[var(--border)] bg-white sticky top-[49px] z-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {fixedTabs.map((tab) => (
            <a key={tab.href} href={tab.href} className={tabClass(tab.href, tab.exact)}>
              {tab.label}
            </a>
          ))}
          </div>

          {/* + button for quick actions — outside scrollable area so dropdown isn't clipped */}
          <div className="relative shrink-0" ref={plusRef}>
            <button
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              className="flex items-center justify-center w-6 h-6 rounded-full text-[var(--muted)] hover:text-[var(--accent)] hover:bg-gray-100 transition"
              title="New project"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>

            {showPlusMenu && (
              <div className="absolute top-full left-0 mt-1 w-[180px] bg-white border border-[var(--border)] rounded-lg shadow-lg z-50 py-1">
                <button
                  onClick={() => {
                    setShowPlusMenu(false);
                    setShowCreateFlow(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-gray-50 transition text-left"
                >
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                  New Project
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {activeProjects.length > 0 && (
            <div className="w-px h-5 bg-[var(--border)] mx-1 shrink-0" />
          )}

          {activeProjects.map((project) => {
            const href = `/admin/tickets/projects/${project.id}`;
            return (
              <a key={project.id} href={href} className={tabClass(href)}>
                {project.clientName || project.name}
              </a>
            );
          })}

          {completedProjects.length > 0 && (
            <div className="relative ml-1 shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className={`flex items-center gap-1 px-2 py-2 text-sm transition border-b-2 border-transparent ${
                  showCompleted
                    ? "text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <span>Completed</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showCompleted ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {showCompleted && (
                <div className="absolute top-full left-0 mt-1 w-[220px] bg-white border border-[var(--border)] rounded-lg shadow-lg z-50 py-1">
                  {completedProjects.map((project) => (
                    <a
                      key={project.id}
                      href={`/admin/tickets/projects/${project.id}`}
                      className="block px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50 transition"
                    >
                      {project.clientName || project.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* New Project flow modal */}
      {showCreateFlow && (
        <ProjectCreateFlow
          onClose={() => setShowCreateFlow(false)}
          onCreated={() => {
            setShowCreateFlow(false);
            // Projects auto-refresh via useQuery
          }}
        />
      )}
    </div>
  );
}
