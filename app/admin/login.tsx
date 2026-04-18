"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface TeamProfile {
  id: number;
  name: string;
  email: string;
  profilePicUrl: string;
}

export default function AdminLogin() {
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [selected, setSelected] = useState<TeamProfile | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && !!(window as any).__TAURI__);
  }, []);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/team/profiles")
      .then((r) => r.json())
      .then((data) => setProfiles(data))
      .catch(() => {});
  }, []);

  function handleSelect(profile: TeamProfile) {
    setFlipping(true);
    setTimeout(() => {
      setSelected(profile);
      setPassword("");
      setError("");
      setFlipping(false);
      // In dev mode, auto-login after selecting
      const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (isDev) {
        setTimeout(async () => {
          const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: profile.email, password: "dev" }),
          });
          if (res.ok) window.location.href = "/admin";
        }, 100);
      } else {
        setTimeout(() => passwordRef.current?.focus(), 100);
      }
    }, 250);
  }

  function handleBack() {
    setFlipping(true);
    setTimeout(() => {
      setSelected(null);
      setPassword("");
      setError("");
      setFlipping(false);
    }, 250);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: selected.email, password }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
        setLoading(false);
      }
    } catch {
      setError("Connection error");
      setLoading(false);
    }
  }

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50">
      <div
        className="transition-all duration-300 ease-in-out"
        style={{
          opacity: flipping ? 0 : 1,
          transform: flipping ? "scale(0.95)" : "scale(1)",
        }}
      >
        {!selected ? (
          /* ── Avatar Grid ── */
          <div className="text-center">
            <img
              src="/choquer-logo.svg"
              alt="Choquer Agency"
              className="h-5.5 mx-auto mb-6"
            />
            <p className="text-sm text-gray-500 mb-8">
              Select your profile to sign in.
            </p>
            <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(profiles.length, 8)}, 1fr)` }}>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className="group flex flex-col items-center gap-2 transition-transform hover:scale-105"
                >
                  <div className="w-[120px] h-[120px] rounded-full overflow-hidden border-3 border-transparent group-hover:border-orange-400 transition-colors bg-gray-100 flex items-center justify-center">
                    {p.profilePicUrl ? (
                      <img
                        src={p.profilePicUrl}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-semibold text-gray-400">
                        {initials(p.name)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">
                    {p.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Password Entry ── */
          <form
            onSubmit={handleSubmit}
            className="relative bg-white p-8 rounded-xl border border-gray-200 w-full max-w-xs text-center"
          >
            <button
              type="button"
              onClick={handleBack}
              className="absolute top-4 left-4 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              &larr; Back
            </button>
            <div className="w-[100px] h-[100px] rounded-full overflow-hidden mx-auto mb-4 bg-gray-100 flex items-center justify-center">
              {selected.profilePicUrl ? (
                <img
                  src={selected.profilePicUrl}
                  alt={selected.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-semibold text-gray-400">
                  {initials(selected.name)}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              {selected.name}
            </p>
            <p className="text-xs text-gray-400 mb-5">{selected.email}</p>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            {error && <p className="text-sm text-danger mt-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 px-4 py-2 bg-foreground text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}
      </div>

      {!isDesktop && (
        <p
          className="mt-8 text-xs text-orange-500 text-center"
          style={{ maxWidth: "calc(24rem * 0.8)" }}
        >
          Looking for your client dashboard? Check your email from Choquer Agency
          for the correct link.
        </p>
      )}
    </div>
  );
}
