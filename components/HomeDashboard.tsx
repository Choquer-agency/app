"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BulletinData,
  BulletinProject,
  Announcement,
  ProjectStatus,
  AnnouncementType,
  CalendarEntry,
} from "@/types";
import { hasMinRole, type RoleLevel } from "@/lib/permissions";
import WhosInWidget from "./WhosInWidget";
import QuickClockBar from "./timesheet/QuickClockBar";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function isNew(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 48 * 60 * 60 * 1000;
}

const PROJECT_STATUS_STYLES: Record<ProjectStatus, { text: string; pill: string }> = {
  active: { text: "text-[#1a4a7a]", pill: "bg-[#B1D0FF] text-[#1a4a7a]" },
  on_hold: { text: "text-[#6b5f00]", pill: "bg-[#FFF09E] text-[#6b5f00]" },
  completed: { text: "text-gray-500", pill: "bg-gray-200 text-gray-600" },
};

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
};

const ANNOUNCEMENT_TYPE_CONFIG: Record<AnnouncementType, { icon: string; border: string }> = {
  general: { icon: "📢", border: "border-[#BDFFE8]" },
  birthday: { icon: "🎂", border: "border-[#FFA69E]" },
  anniversary: { icon: "🎉", border: "border-[#A69FFF]" },
  time_off: { icon: "🏖️", border: "border-[#B1D0FF]" },
};

function AuthorAvatar({ name, picUrl }: { name: string; picUrl?: string }) {
  if (picUrl) {
    return (
      <img
        src={picUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover border border-[var(--border)]"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-[#BDFFE8] flex items-center justify-center text-xs font-bold text-[#0d5a3f]">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😂", "🔥", "👏", "💯", "🙌"];

const GREETINGS = [
  // Early morning (before 10)
  "Good morning, NAME",
  "Rise and shine, NAME",
  "Morning, NAME",
  "Top of the morning, NAME",
  "Wakey wakey, NAME",
  "Early bird gets the worm, NAME",
  "Fresh start, NAME",
  "New day, new wins, NAME",
  "Let's get after it, NAME",
  "Here we go, NAME",
  "Ready to roll, NAME",
  "Bright and early, NAME",
  "Coffee's ready, NAME",
  "Another beautiful day, NAME",
  "Up and at 'em, NAME",
  // Midday (10-12)
  "Hey there, NAME",
  "What's good, NAME",
  "Looking sharp, NAME",
  "Good to see you, NAME",
  "Welcome in, NAME",
  "Let's make it count, NAME",
  "Glad you're here, NAME",
  "What's on the agenda, NAME",
  "Time to make things happen, NAME",
  "Let's crush it, NAME",
  "Another one, NAME",
  "You showed up, NAME",
  "The team is better with you, NAME",
  "Alright, NAME",
  "Let's do this, NAME",
  // Afternoon (12-17)
  "Welcome back, NAME",
  "Good afternoon, NAME",
  "Halfway there, NAME",
  "Keep the momentum, NAME",
  "Afternoon hustle, NAME",
  "Strong second half, NAME",
  "Still going strong, NAME",
  "Powering through, NAME",
  "The grind continues, NAME",
  "Back at it, NAME",
  "Home stretch energy, NAME",
  "Stay locked in, NAME",
  "Finish strong, NAME",
  "Keep pushing, NAME",
  "You got this, NAME",
  // Evening (after 17)
  "Burning the midnight oil, NAME",
  "Still at it, NAME",
  "Night owl mode, NAME",
  "The hustle never sleeps, NAME",
  "Dedicated, NAME",
  "After hours legend, NAME",
  "Working late, NAME",
  "Moonlight grind, NAME",
  "Overtime hero, NAME",
  "Wrapping up, NAME",
  "Almost there, NAME",
  "Late night vibes, NAME",
  "One more push, NAME",
  "Respect the dedication, NAME",
  "Closing out strong, NAME",
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CALENDAR_TYPE_ICONS: Record<string, string> = {
  birthday: "🎂",
  anniversary: "🎉",
  holiday: "🏖️",
  event: "📌",
  custom: "📌",
};

function CalendarList({ entries }: { entries: CalendarEntry[] }) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Show this month + next month only
  const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().split("T")[0];
  const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const filtered = entries.filter((e) => e.date >= startOfMonth && e.date <= endDate);

  // Group by month
  const grouped: Record<string, CalendarEntry[]> = {};
  for (const entry of filtered) {
    const monthKey = entry.date.substring(0, 7); // "2026-03"
    if (!grouped[monthKey]) grouped[monthKey] = [];
    grouped[monthKey].push(entry);
  }

  const monthKeys = Object.keys(grouped).sort();

  if (monthKeys.length === 0) {
    return <p className="text-sm text-[#C4A85A]">No upcoming dates</p>;
  }

  return (
    <div className="space-y-4">
      {monthKeys.map((monthKey) => {
        const [year, monthIdx] = monthKey.split("-").map(Number);
        const monthName = MONTH_NAMES[monthIdx - 1];
        const isCurrentMonth = monthKey === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

        return (
          <div key={monthKey}>
            <h3 className={`text-xs font-bold uppercase tracking-wide mb-2 ${isCurrentMonth ? "text-[#8B6914]" : "text-[#C4A85A]"}`}>
              {monthName}{year !== today.getFullYear() ? ` ${year}` : ""}
            </h3>
            <div className="space-y-1.5">
              {grouped[monthKey].map((entry, i) => {
                const day = parseInt(entry.date.split("-")[2]);
                const month = MONTH_SHORT[parseInt(entry.date.split("-")[1]) - 1];
                const icon = CALENDAR_TYPE_ICONS[entry.type] || "📌";
                const isToday = entry.date === todayStr;

                const isPast = entry.date < todayStr;

                return (
                  <div
                    key={`${entry.date}-${i}`}
                    className={`flex items-center gap-2 py-1 px-2 rounded-lg text-sm ${
                      isToday ? "bg-[#FFF09E]/50" : isPast ? "opacity-50" : ""
                    }`}
                  >
                    <span className={`text-xs w-12 shrink-0 ${isPast ? "text-[#C4A85A]/60" : "text-[#C4A85A]"}`}>{month} {day}</span>
                    {isPast ? (
                      <span className="text-xs text-green-500">&#10003;</span>
                    ) : (
                      <span className="text-xs">{icon}</span>
                    )}
                    <span className={`text-xs ${isToday ? "text-[#5a4a1a] font-medium" : isPast ? "text-[#C4A85A] line-through" : "text-[#8B6914]"}`}>
                      {entry.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  let pool: string[];
  if (hour < 10) {
    pool = GREETINGS.slice(0, 15);
  } else if (hour < 12) {
    pool = GREETINGS.slice(15, 30);
  } else if (hour < 17) {
    pool = GREETINGS.slice(30, 45);
  } else {
    pool = GREETINGS.slice(45);
  }
  // Use a seed based on the day + name so it stays consistent for a few hours
  // but different per person
  const seed = (new Date().getDate() * 100 + hour * 7 + name.length * 13) % pool.length;
  return pool[seed].replace("NAME", name);
}

function ReactionBar({
  reactions,
  announcementId,
  currentUserId,
  onReact,
}: {
  reactions: Array<{ emoji: string; memberName: string; memberId: number }>;
  announcementId: number;
  currentUserId: number;
  onReact: (announcementId: number, emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const grouped: Record<string, { count: number; names: string[]; myReaction: boolean }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, names: [], myReaction: false };
    grouped[r.emoji].count++;
    grouped[r.emoji].names.push(r.memberName);
    if (r.memberId === currentUserId) grouped[r.emoji].myReaction = true;
  }

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {Object.entries(grouped).map(([emoji, data]) => (
        <button
          key={emoji}
          onClick={() => onReact(announcementId, emoji)}
          title={data.names.join(", ")}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition ${
            data.myReaction
              ? "bg-[#BDFFE8]"
              : "bg-white/60 hover:bg-white"
          }`}
        >
          <span className="text-xs">{emoji}</span>
          <span className="font-medium text-[var(--foreground)]">{data.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-white/80 transition text-[10px] opacity-40 hover:opacity-100"
          title="Add reaction"
        >
          +
        </button>

        {showPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
            <div className="absolute bottom-full left-0 mb-1 z-20 bg-white rounded-xl shadow-lg border border-[var(--border)] p-1.5 flex gap-0.5">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(announcementId, emoji);
                    setShowPicker(false);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-base"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function HomeDashboard({
  roleLevel,
  userName,
  teamMemberId,
}: {
  roleLevel: string;
  userName: string;
  teamMemberId: number;
}) {
  const [data, setData] = useState<BulletinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchBulletin = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bulletin");
      if (res.ok) {
        const bulletinData: BulletinData = await res.json();
        setData(bulletinData);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBulletin();
  }, [fetchBulletin]);

  async function handleCreateAnnouncement() {
    if (!announcementTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/bulletin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: announcementTitle, content: announcementContent }),
      });
      if (res.ok) {
        setAnnouncementTitle("");
        setAnnouncementContent("");
        setShowAnnouncementForm(false);
        fetchBulletin();
      }
    } catch {
    } finally {
      setSubmitting(false);
    }
  }

  function handleReaction(announcementId: number, emoji: string) {
    if (!data) return;

    // Optimistic update
    setData({
      ...data,
      announcements: data.announcements.map((a) => {
        if (a.id !== announcementId) return a;
        const existing = a.reactions.find(
          (r) => r.emoji === emoji && r.memberId === teamMemberId
        );
        return {
          ...a,
          reactions: existing
            ? a.reactions.filter((r) => !(r.emoji === emoji && r.memberId === teamMemberId))
            : [...a.reactions, { emoji, memberName: userName, memberId: teamMemberId }],
        };
      }),
    });

    // Fire and forget
    fetch("/api/admin/bulletin/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId, emoji }),
    }).catch(() => {});
  }

  async function handleDeleteAnnouncement(id: number) {
    try {
      const res = await fetch(`/api/admin/bulletin/announcements?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchBulletin();
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  const isOwner = hasMinRole(roleLevel as RoleLevel, "owner");
  const firstName = userName.split(" ")[0];
  const greeting = getGreeting(firstName);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-5xl font-medium text-[var(--foreground)]">
          {greeting}
        </h1>
        {data?.weeklyQuote ? (
          <div className="mt-3">
            <p className="text-base italic text-[var(--foreground)] leading-relaxed">
              &ldquo;{data.weeklyQuote.quote}&rdquo;
              {data.weeklyQuote.author && (
                <span className="not-italic"> &mdash; {data.weeklyQuote.author}</span>
              )}
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-base italic text-[var(--foreground)] leading-relaxed">
              &ldquo;The best time to plant a tree was 20 years ago. The second best time is now.&rdquo;
              <span className="not-italic"> &mdash; Chinese Proverb</span>
            </p>
          </div>
        )}
      </div>

      {/* Quick Clock Bar — employees/interns only */}
      {!hasMinRole(roleLevel as RoleLevel, "bookkeeper") && (
        <QuickClockBar teamMemberId={String(teamMemberId)} />
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Team Announcements — teal theme, 2 cols */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-[#F2FFF9] overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📋</span>
                <div>
                  <h2 className="text-sm font-bold text-[#0d5a3f]">Team Announcements</h2>
                  <p className="text-[10px] text-[#0d5a3f]/60">Birthdays, milestones & team news</p>
                </div>
              </div>
              <button
                onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
                className="px-3 py-1.5 text-xs font-medium text-[#0d5a3f] bg-white/70 rounded-lg hover:bg-white transition"
              >
                + New
              </button>
            </div>

            <div className="px-4 pb-4">
              {showAnnouncementForm && (
                <div className="mb-4 p-4 rounded-xl bg-white/80 space-y-3">
                  <input
                    type="text"
                    placeholder="What's happening?"
                    value={announcementTitle}
                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-[#BDFFE8] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#BDFFE8]"
                  />
                  <textarea
                    placeholder="Add more details (optional)..."
                    value={announcementContent}
                    onChange={(e) => setAnnouncementContent(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-[#BDFFE8] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#BDFFE8] resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowAnnouncementForm(false);
                        setAnnouncementTitle("");
                        setAnnouncementContent("");
                      }}
                      className="px-4 py-2 text-xs text-[#0d5a3f]/60 hover:text-[#0d5a3f] rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateAnnouncement}
                      disabled={submitting || !announcementTitle.trim()}
                      className="px-4 py-2 text-xs font-medium text-white bg-[#0d7a55] rounded-lg hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {submitting ? "Posting..." : "Post Announcement"}
                    </button>
                  </div>
                </div>
              )}

              {!data?.announcements.length ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#0d5a3f]/60">No announcements today</p>
                  <p className="text-xs text-[#0d5a3f]/40 mt-1">Post one to get the team in the loop!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.announcements.map((a: Announcement) => {
                    const typeConfig = ANNOUNCEMENT_TYPE_CONFIG[a.announcementType as AnnouncementType] || ANNOUNCEMENT_TYPE_CONFIG.general;
                    const isNewAnnouncement = a.source !== "auto" && isNew(a.createdAt);

                    return (
                      <div
                        key={a.id}
                        className="p-3.5 rounded-xl bg-white/80 transition hover:bg-white"
                      >
                        <div className="flex items-start gap-3">
                          {/* Profile pic or type icon */}
                          {a.authorName !== "System" ? (
                            <AuthorAvatar name={a.authorName} picUrl={a.authorPic || undefined} />
                          ) : (
                            <span className="text-lg mt-0.5 shrink-0">{typeConfig.icon}</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {a.pinned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FFF09E] text-[#6b5f00] font-medium">Pinned</span>}
                              {isNewAnnouncement && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#BDFFE8] text-[#0d5a3f] font-medium">New</span>}
                              {a.source === "slack" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FBBDFF] text-[#6b1470] font-medium">via Slack</span>}
                              {a.announcementType !== "general" && (
                                <span className="text-sm">{typeConfig.icon}</span>
                              )}
                              <span className="text-sm font-semibold text-[var(--foreground)]">{a.title}</span>
                            </div>
                            {a.content && (
                              <p className="text-xs text-[var(--muted)] mt-1 whitespace-pre-wrap">{a.content}</p>
                            )}
                            {a.imageUrl && (
                              <img
                                src={a.imageUrl}
                                alt=""
                                className="mt-2 rounded-lg max-h-48 object-cover w-full"
                              />
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <p className="text-[10px] text-[var(--muted)] shrink-0">
                                {a.authorName !== "System" ? `${a.authorName} · ` : ""}{timeAgo(a.createdAt)}
                              </p>
                              {a.id > 0 && (
                                <ReactionBar
                                  reactions={a.reactions || []}
                                  announcementId={a.id}
                                  currentUserId={teamMemberId}
                                  onReact={handleReaction}
                                />
                              )}
                            </div>
                          </div>
                          {/* Only owner can delete */}
                          {isOwner && a.id > 0 && (
                            <button
                              onClick={() => handleDeleteAnnouncement(a.id)}
                              className="text-xs text-[var(--muted)] hover:text-red-500 shrink-0 p-1"
                              title="Delete"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Calendar — yellow theme */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-[#FFFDF2] p-5 h-full flex flex-col min-h-[280px] overflow-y-auto max-h-[500px]">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📅</span>
              <h2 className="text-sm font-bold text-[#8B6914]">Upcoming</h2>
            </div>
            {data?.calendar && data.calendar.length > 0 ? (
              <CalendarList entries={data.calendar} />
            ) : (
              <p className="text-sm text-[#C4A85A]">No upcoming dates</p>
            )}
          </div>
        </div>
      </div>

      {/* Hidden: co-located team, low value — kept for future use */}
      {false && <WhosInWidget />}

      {/* Project Status — blue theme */}
      <div className="rounded-2xl bg-[#F0F6FF] overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🚀</span>
            <div>
              <h2 className="text-sm font-bold text-[#1a4a7a]">Project Status</h2>
              <p className="text-[10px] text-[#1a4a7a]/60">
                {data?.projects.length ? `${data.projects.length} active project${data.projects.length > 1 ? "s" : ""}` : "No active projects"}
              </p>
            </div>
          </div>
        </div>

        {!data?.projects.length ? (
          <div className="text-center py-8">
            <p className="text-sm text-[#1a4a7a]/60">No active projects</p>
          </div>
        ) : (
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.projects.map((p: BulletinProject) => {
              const style = PROJECT_STATUS_STYLES[p.status] || PROJECT_STATUS_STYLES.active;
              const progress = p.ticketCount > 0
                ? Math.round((p.completedTicketCount / p.ticketCount) * 100)
                : 0;

              return (
                <div
                  key={p.id}
                  className="rounded-xl bg-white/80 p-4 hover:bg-white transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">{p.projectName}</p>
                      <p className="text-xs text-[var(--muted)] truncate">{p.clientName}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${style.pill}`}>
                      {PROJECT_STATUS_LABELS[p.status]}
                    </span>
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[var(--muted)]">
                        {p.completedTicketCount}/{p.ticketCount} tasks
                      </span>
                      <span className={`text-[10px] font-bold ${style.text}`}>{progress}%</span>
                    </div>
                    <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress}%`,
                          background: p.status === "active"
                            ? "#B1D0FF"
                            : p.status === "on_hold"
                            ? "#FFF09E"
                            : "#9CA3AF",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
