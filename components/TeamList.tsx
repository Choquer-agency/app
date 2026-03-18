"use client";

import { useState, useEffect, useCallback } from "react";
import { TeamMember } from "@/types";
import CopyField from "./CopyField";

function TeamMemberFormModal({
  member,
  onClose,
  onSaved,
}: {
  member?: TeamMember | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!member;
  const [name, setName] = useState(member?.name || "");
  const [email, setEmail] = useState(member?.email || "");
  const [role, setRole] = useState(member?.role || "");
  const [calLink, setCalLink] = useState(member?.calLink || "");
  const [profilePicUrl, setProfilePicUrl] = useState(member?.profilePicUrl || "");
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

    const body = {
      ...(isEditing ? { id: member!.id } : {}),
      name: name.trim(),
      email: email.trim(),
      role,
      calLink,
      profilePicUrl,
    };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 max-h-[calc(100vh-100px)] flex flex-col">
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

export default function TeamList() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migrating, setMigrating] = useState(false);

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
        <button
          onClick={() => { setEditingMember(null); setShowModal(true); }}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Add Member
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.length === 0 ? (
          <p className="text-sm text-[var(--muted)] col-span-full text-center py-8">
            No team members yet. Click &quot;+ Add Member&quot; to get started.
          </p>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className={`bg-white rounded-xl border border-gray-200 p-5 space-y-3 ${
                !member.active ? "opacity-50" : ""
              }`}
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
                  <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] font-bold text-lg">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-[var(--foreground)]">{member.name}</p>
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
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 border-t border-[var(--border)]">
                <button
                  onClick={() => { setEditingMember(member); setShowModal(true); }}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Edit
                </button>
                {member.active ? (
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
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <TeamMemberFormModal
          member={editingMember}
          onClose={() => { setShowModal(false); setEditingMember(null); }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
