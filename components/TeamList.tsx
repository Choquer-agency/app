"use client";

import { useState, useEffect, useCallback } from "react";
import { TeamMember } from "@/types";
import CopyField from "./CopyField";
import { hasPermission, hasMinRole, ROLE_LEVELS, ROLE_LABELS, type RoleLevel } from "@/lib/permissions";
import { friendlyDate, friendlyMonth } from "@/lib/date-format";

function TeamMemberFormModal({
  member,
  onClose,
  onSaved,
  canEditWages,
  canManageRoles,
}: {
  member?: TeamMember | null;
  onClose: () => void;
  onSaved: () => void;
  canEditWages: boolean;
  canManageRoles: boolean;
}) {
  const isEditing = !!member;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const [name, setName] = useState(member?.name || "");
  const [email, setEmail] = useState(member?.email || "");
  const [role, setRole] = useState(member?.role || "");
  const [calLink, setCalLink] = useState(member?.calLink || "");
  const [profilePicUrl, setProfilePicUrl] = useState(member?.profilePicUrl || "");
  const [startDate, setStartDate] = useState(member?.startDate || "");
  const [birthday, setBirthday] = useState(member?.birthday || "");
  const [availableHoursPerWeek, setAvailableHoursPerWeek] = useState<number | "">(
    member?.availableHoursPerWeek ?? 40
  );
  const [hourlyRate, setHourlyRate] = useState<number | "">(member?.hourlyRate ?? "");
  const [salary, setSalary] = useState<number | "">(member?.salary ?? "");
  const [payType, setPayType] = useState<"hourly" | "salary">(member?.payType ?? "hourly");
  const [memberRoleLevel, setMemberRoleLevel] = useState<RoleLevel>((member?.roleLevel as RoleLevel) ?? "employee");
  const [slackUserId, setSlackUserId] = useState(member?.slackUserId || "");
  const [tags, setTags] = useState<string[]>(member?.tags || []);
  const [employeeStatus, setEmployeeStatus] = useState(member?.employeeStatus || "active");
  const [sickDaysTotal, setSickDaysTotal] = useState<number | "">(member?.sickDaysTotal ?? 5);
  const [bypassClockIn, setBypassClockIn] = useState(member?.bypassClockIn ?? false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      setProfilePicUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    const body: Record<string, unknown> = {
      ...(isEditing ? { id: member!.id } : {}),
      name: name.trim(),
      email: email.trim(),
      role,
      calLink,
      profilePicUrl,
      startDate: startDate || "",
      birthday: birthday || "",
      availableHoursPerWeek: availableHoursPerWeek === "" ? 40 : availableHoursPerWeek,
      slackUserId: slackUserId.trim() || "",
      tags,
    };

    if (canEditWages) {
      body.hourlyRate = hourlyRate === "" ? null : hourlyRate;
      body.salary = salary === "" ? null : salary;
      body.payType = payType;
    }

    if (canManageRoles) {
      body.roleLevel = memberRoleLevel;
      body.employeeStatus = employeeStatus;
      body.sickDaysTotal = sickDaysTotal === "" ? 5 : sickDaysTotal;
      body.bypassClockIn = bypassClockIn;
    }

    try {
      const res = await fetch("/api/admin/team", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm py-[50px]">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 max-h-full flex flex-col overflow-hidden">
        <h2 className="text-lg font-semibold px-8 pt-8 pb-4 shrink-0">
          {isEditing ? "Edit Team Member" : "Add Team Member"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-8 pb-8">
          {/* Profile Picture Upload */}
          <div className="flex items-center gap-4">
            {profilePicUrl ? (
              <img
                src={profilePicUrl}
                alt="Preview"
                className="w-16 h-16 rounded-full object-cover border-2 border-[var(--border)]"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] font-bold text-2xl">
                {name ? name.charAt(0).toUpperCase() : "?"}
              </div>
            )}
            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Profile Picture
              </label>
              <label className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition ${
                uploading
                  ? "bg-gray-100 text-[var(--muted)] cursor-wait"
                  : "bg-[var(--accent-light)] text-[var(--accent)] hover:bg-[#FFE0B2]"
              }`}>
                {uploading ? "Uploading..." : profilePicUrl ? "Change Photo" : "Upload Photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {profilePicUrl && (
                <button
                  type="button"
                  onClick={() => setProfilePicUrl("")}
                  className="ml-2 text-xs text-[var(--muted)] hover:text-[#b91c1c]"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" autoFocus required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@choquer.com" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Role</label>
            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Account Manager" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Cal Link</label>
            <input type="url" value={calLink} onChange={(e) => setCalLink(e.target.value)} placeholder="https://cal.com/..." className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Birthday</label>
              <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Available Hours / Week</label>
            <input
              type="number"
              min={0}
              max={80}
              value={availableHoursPerWeek}
              onChange={(e) => setAvailableHoursPerWeek(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="40"
              className={inputClass}
            />
            <p className="text-xs text-[var(--muted)] mt-1">Used for utilization reports</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Slack User ID</label>
            <input
              type="text"
              value={slackUserId}
              onChange={(e) => setSlackUserId(e.target.value)}
              placeholder="U12345ABCDE"
              className={inputClass}
            />
            <p className="text-xs text-[var(--muted)] mt-1">For automated check-ins. Find in Slack: Profile → ⋯ → Copy member ID</p>
          </div>

          {/* Board Tags */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Board Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {["SEO", "Google Ads"].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setTags((prev) =>
                      prev.includes(tag)
                        ? prev.filter((t) => t !== tag)
                        : [...prev, tag]
                    )
                  }
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                    tags.includes(tag)
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-white text-[var(--muted)] border-[var(--border)] hover:border-gray-400"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)]">Controls which service boards this member can see</p>
          </div>

          {/* Clock-in bypass */}
          {canManageRoles && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bypassClockIn}
                  onChange={(e) => setBypassClockIn(e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                <span className="text-sm font-medium text-[var(--foreground)]">Bypass clock-in requirement</span>
              </label>
              <p className="text-xs text-[var(--muted)] mt-1 ml-6">Allow this member to start ticket timers without clocking in first</p>
            </div>
          )}

          {/* Compensation — only visible to authorized roles */}
          {canEditWages && (
            <>
              <div className="border-t border-[var(--border)] pt-4 mt-2">
                <p className="text-sm font-medium text-[var(--foreground)] mb-3">Compensation</p>
                <div className="flex items-center gap-3 mb-3">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="payType" value="hourly" checked={payType === "hourly"} onChange={() => setPayType("hourly")} className="accent-[var(--accent)]" />
                    Hourly
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="payType" value="salary" checked={payType === "salary"} onChange={() => setPayType("salary")} className="accent-[var(--accent)]" />
                    Salary
                  </label>
                </div>
                {payType === "hourly" ? (
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Hourly Rate ($)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="0.00"
                      className={inputClass}
                    />
                    <p className="text-xs text-[var(--muted)] mt-1">Used for profitability calculations</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Annual Salary ($)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={salary}
                      onChange={(e) => setSalary(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="0.00"
                      className={inputClass}
                    />
                    <p className="text-xs text-[var(--muted)] mt-1">Converted to hourly rate using available hours/week</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Time Off Allocation — only visible to owner */}
          {canManageRoles && (
            <div className="border-t border-[var(--border)] pt-4 mt-2">
              <p className="text-sm font-medium text-[var(--foreground)] mb-3">Time Off Allocation</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Vacation Days / Year</label>
                  <input
                    type="number"
                    min={0}
                    value={member?.vacationDaysTotal ?? 10}
                    onChange={() => {}}
                    className={inputClass}
                    readOnly
                  />
                  <p className="text-xs text-[var(--muted)] mt-1">Used: {member?.vacationDaysUsed ?? 0}</p>
                </div>
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">Sick Days / Year</label>
                  <input
                    type="number"
                    min={0}
                    value={sickDaysTotal}
                    onChange={(e) => setSickDaysTotal(e.target.value === "" ? "" : Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Role Level — only visible to owner */}
          {canManageRoles && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Access Level</label>
              <select
                value={memberRoleLevel}
                onChange={(e) => setMemberRoleLevel(e.target.value as RoleLevel)}
                className={inputClass}
              >
                {ROLE_LEVELS.map((rl) => (
                  <option key={rl} value={rl}>{ROLE_LABELS[rl]}</option>
                ))}
              </select>
              <p className="text-xs text-[var(--muted)] mt-1">Controls what this team member can see and do</p>
            </div>
          )}

          {/* Employee Status — only visible to owner */}
          {canManageRoles && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Employee Status</label>
              <select
                value={employeeStatus}
                onChange={(e) => setEmployeeStatus(e.target.value)}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="maternity_leave">Maternity Leave</option>
                <option value="leave">On Leave</option>
                <option value="terminated">Terminated</option>
                <option value="past_employee">Past Employee</option>
              </select>
              <p className="text-xs text-[var(--muted)] mt-1">Non-active employees are hidden from timesheets and daily views</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-[#b91c1c] bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] bg-gray-100 rounded-lg hover:bg-gray-200 transition">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || !email.trim() || submitting || uploading} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50">
              {submitting ? "..." : isEditing ? "Save Changes" : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamList({ roleLevel, currentMemberId }: { roleLevel?: RoleLevel; currentMemberId?: string | number }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const canViewWages = roleLevel ? hasPermission(roleLevel, "team:view_wages") : false;
  const canEditWages = roleLevel ? hasPermission(roleLevel, "team:edit_wages") : false;
  const canManageRoles = roleLevel ? hasPermission(roleLevel, "team:manage_roles") : false;
  const canEditOthers = roleLevel ? hasMinRole(roleLevel, "c_suite") : false;
  const canAddMembers = roleLevel ? hasMinRole(roleLevel, "c_suite") : false;

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/team");
      if (res.ok) {
        setMembers(await res.json());
        setNeedsMigration(false);
      } else {
        setNeedsMigration(true);
      }
    } catch {
      setNeedsMigration(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function runMigrations() {
    setMigrating(true);
    try {
      const res = await fetch("/api/admin/migrate", { method: "POST" });
      if (res.ok) {
        setNeedsMigration(false);
        fetchMembers();
      }
    } catch {
      // Failed
    } finally {
      setMigrating(false);
    }
  }

  function handleSaved() {
    setShowModal(false);
    setEditingMember(null);
    fetchMembers();
  }

  async function handleDeactivate(member: TeamMember) {
    if (!confirm(`Deactivate ${member.name}?`)) return;
    try {
      await fetch("/api/admin/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, active: false }),
      });
      fetchMembers();
    } catch {
      // Failed
    }
  }

  async function handleReactivate(member: TeamMember) {
    try {
      await fetch("/api/admin/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, active: true }),
      });
      fetchMembers();
    } catch {
      // Failed
    }
  }

  async function handleDelete(member: TeamMember) {
    if (!confirm(`Permanently delete ${member.name}? This cannot be undone.`)) return;
    try {
      await fetch(`/api/admin/team?id=${member.id}`, { method: "DELETE" });
      fetchMembers();
    } catch {
      // Failed
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (needsMigration) {
    return (
      <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center space-y-4">
        <p className="text-[var(--foreground)] font-medium">Database setup required</p>
        <p className="text-sm text-[var(--muted)]">The team members table needs to be created.</p>
        <button onClick={runMigrations} disabled={migrating} className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50">
          {migrating ? "Running migrations..." : "Run Migrations"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Team</h2>
          <p className="text-sm text-[var(--muted)] mt-1">Manage your agency team members</p>
        </div>
        {canAddMembers && (
          <button
            onClick={() => { setEditingMember(null); setShowModal(true); }}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
          >
            + Add Member
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.length === 0 ? (
          <p className="text-sm text-[var(--muted)] col-span-full text-center py-8">
            No team members yet. Click &quot;+ Add Member&quot; to get started.
          </p>
        ) : (
          [...members].sort((a, b) => {
            const aOnLeave = a.employeeStatus && a.employeeStatus !== "active" ? 1 : 0;
            const bOnLeave = b.employeeStatus && b.employeeStatus !== "active" ? 1 : 0;
            return aOnLeave - bOnLeave;
          }).map((member, index) => {
            // Bryce is always first (from query) and always orange
            // Everyone else gets a unique color from the palette
            const teamColors = [
              'var(--accent)',        // orange — Bryce
              'var(--trust-blue)',    // blue
              'var(--click-mint)',    // mint
              'var(--serenity)',      // purple
              '#F4A0A0',             // rose
              '#A0D4C1',             // sage
              '#FFD580',             // gold
              '#B8C9E8',             // slate blue
            ];
            const cardColor = teamColors[index % teamColors.length];
            return (
            <div
              key={member.id}
              className={`bg-white rounded-xl border border-gray-200 p-5 space-y-3 ${
                !member.active ? "opacity-50" : ""
              }`}
              style={{ borderLeftWidth: '4px', borderLeftColor: cardColor }}
            >
              {/* Header with pic */}
              <div className="flex items-center gap-3">
                {member.profilePicUrl ? (
                  <img
                    src={member.profilePicUrl}
                    alt={member.name}
                    className="w-12 h-12 rounded-full object-cover border border-[var(--border)]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white" style={{ backgroundColor: cardColor }}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[var(--foreground)]">{member.name}</p>
                    {member.employeeStatus && member.employeeStatus !== "active" && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        member.employeeStatus === "maternity_leave" ? "bg-pink-50 text-pink-600" :
                        member.employeeStatus === "leave" ? "bg-amber-50 text-amber-600" :
                        member.employeeStatus === "terminated" ? "bg-red-50 text-red-600" :
                        member.employeeStatus === "past_employee" ? "bg-gray-100 text-gray-500" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {member.employeeStatus === "maternity_leave" ? "Maternity Leave" :
                         member.employeeStatus === "leave" ? "On Leave" :
                         member.employeeStatus === "terminated" ? "Terminated" :
                         member.employeeStatus === "past_employee" ? "Past Employee" :
                         member.employeeStatus}
                      </span>
                    )}
                  </div>
                  {member.role && (
                    <p className="text-xs text-[var(--muted)]">{member.role}</p>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-sm">
                <div className="text-[var(--foreground)]">
                  <CopyField value={member.email} label="email" />
                </div>
                {member.calLink && (
                  <a
                    href={member.calLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline block"
                  >
                    Book a call
                  </a>
                )}
                {(member.startDate || member.birthday) && (
                  <div className="flex gap-3 text-xs text-[var(--muted)] pt-1">
                    {member.startDate && (
                      <span>Started {friendlyMonth(member.startDate)}</span>
                    )}
                    {member.birthday && (
                      <span>Birthday {friendlyDate(member.birthday)}</span>
                    )}
                  </div>
                )}
                {canViewWages && (member.hourlyRate || member.salary) && (
                  <div className="flex gap-3 text-xs text-[var(--muted)] pt-1">
                    {member.payType === "salary" && member.salary != null && (
                      <span>Salary: ${member.salary.toLocaleString()}/yr</span>
                    )}
                    {member.hourlyRate != null && (
                      <span>Rate: ${member.hourlyRate.toFixed(2)}/hr</span>
                    )}
                  </div>
                )}
                {canManageRoles && member.roleLevel && (
                  <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-[var(--muted)]">
                    {ROLE_LABELS[member.roleLevel as RoleLevel] ?? member.roleLevel}
                  </span>
                )}
                {/* Available hours — only visible to admins */}
                {canEditOthers && member.availableHoursPerWeek != null && member.availableHoursPerWeek !== 40 && (
                  <span className="text-xs text-[var(--muted)]">{member.availableHoursPerWeek}h/week</span>
                )}
                {member.tags && member.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {member.tags.map((tag) => (
                      <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions — employees can only edit themselves */}
              {(canEditOthers || String(member.id) === String(currentMemberId)) && (
                <div className="flex gap-2 pt-1 border-t border-[var(--border)]">
                  <button
                    onClick={() => { setEditingMember(member); setShowModal(true); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Edit
                  </button>
                  {/* Only admins can deactivate, and you can't deactivate yourself */}
                  {canEditOthers && String(member.id) !== String(currentMemberId) && (
                    member.active ? (
                      <button
                        onClick={() => handleDeactivate(member)}
                        className="text-xs text-[#b91c1c] hover:text-red-700"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(member)}
                        className="text-xs text-[#0d7a55] hover:text-green-800"
                      >
                        Reactivate
                      </button>
                    )
                  )}
                  {/* Owner can permanently delete (not themselves) */}
                  {canManageRoles && String(member.id) !== String(currentMemberId) && (
                    <button
                      onClick={() => handleDelete(member)}
                      className="text-xs text-[var(--muted)] hover:text-[#b91c1c] ml-auto"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })
        )}
      </div>

      {showModal && (
        <TeamMemberFormModal
          member={editingMember}
          onClose={() => { setShowModal(false); setEditingMember(null); }}
          onSaved={handleSaved}
          canEditWages={canEditWages}
          canManageRoles={canManageRoles}
        />
      )}
    </>
  );
}
