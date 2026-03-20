"use client";

import { useState, useEffect, useCallback } from "react";
import { Package } from "@/types";
import PackageFormModal from "./PackageFormModal";

export default function PackageList() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/packages");
      if (res.ok) {
        setPackages(await res.json());
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

  async function runMigrations() {
    setMigrating(true);
    try {
      const res = await fetch("/api/admin/migrate", { method: "POST" });
      if (res.ok) {
        setNeedsMigration(false);
        fetchPackages();
      } else {
        const data = await res.json();
        alert(`Migration failed: ${data.error}`);
      }
    } catch {
      alert("Migration failed — check your connection.");
    } finally {
      setMigrating(false);
    }
  }

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  function handleAdd() {
    setEditingPkg(null);
    setShowModal(true);
  }

  function handleEdit(pkg: Package) {
    setEditingPkg(pkg);
    setShowModal(true);
  }

  async function handleDelete(pkg: Package) {
    if (!confirm(`Delete "${pkg.name}"? This will permanently remove this package.`)) return;
    try {
      const res = await fetch(`/api/admin/packages/${pkg.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchPackages();
      } else {
        alert("Failed to delete package");
      }
    } catch {
      alert("Failed to delete package");
    }
  }

  function handleSaved() {
    setShowModal(false);
    setEditingPkg(null);
    fetchPackages();
  }

  function formatBillingFrequency(freq: string): string {
    const map: Record<string, string> = {
      one_time: "",
      weekly: "/wk",
      bi_weekly: "/2wks",
      monthly: "/mo",
      quarterly: "/qtr",
      annually: "/yr",
    };
    return map[freq] || "/mo";
  }

  function formatCurrency(val: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">Loading...</div>
    );
  }

  if (needsMigration) {
    return (
      <div className="bg-white rounded-xl border border-[var(--border)] p-8 text-center space-y-4">
        <p className="text-[var(--foreground)] font-medium">Database setup required</p>
        <p className="text-sm text-[var(--muted)]">
          The packages table needs to be created. Click below to run database migrations.
        </p>
        <button
          onClick={runMigrations}
          disabled={migrating}
          className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {migrating ? "Running migrations..." : "Run Migrations"}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Page heading */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Packages</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Manage your service packages and pricing
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition"
        >
          + Add Package
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--accent-light)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Name</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Price</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Services</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No packages yet. Click &quot;+ Add Package&quot; to get started.
                  </td>
                </tr>
              ) : (
                packages.map((pkg) => (
                  <tr key={pkg.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium">{pkg.name}</span>
                        {pkg.description && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {pkg.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatCurrency(pkg.defaultPrice)}{formatBillingFrequency(pkg.billingFrequency)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {pkg.includedServices.length} service{pkg.includedServices.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3">
                      {pkg.active ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-3">
                      <button
                        onClick={() => handleEdit(pkg)}
                        className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(pkg)}
                        className="text-xs text-[#b91c1c] hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <PackageFormModal
          pkg={editingPkg}
          onClose={() => {
            setShowModal(false);
            setEditingPkg(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
