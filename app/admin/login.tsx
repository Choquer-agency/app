"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      setError("Invalid password");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl border border-gray-200 w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">InsightPulse Admin</h1>
        <p className="text-sm text-muted mb-6">Enter admin password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          autoFocus
        />
        {error && <p className="text-sm text-danger mt-2">{error}</p>}
        <button
          type="submit"
          className="w-full mt-4 px-4 py-2 bg-foreground text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          Login
        </button>
      </form>
    </div>
  );
}
