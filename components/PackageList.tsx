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

  async function handleDeactivate(pkg: Package) {
    if (!confirm(`Deactivate "${pkg.name}"?`)) return;
    try {
      await fetch(`/api/admin/packages/${pkg.id}`, { method: "DELETE" });
      fetchPackages();
    } catch {
      // Failed
    }
  }

  async function handleReactivate(pkg: Package) {
    try {
      await fetch(`/api/admin/packages/${pkg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      fetchPackages();
    } catch {
      // Failed
    }
  }

  function handleSaved() {
    setShowModal(false);
    setEditingPkg(null);
    fetchPackages();
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
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">Packages</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {packages.length} package{packages.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 text-sm font-medium text-white bg-[#FF9500] rounded-lg hover:opacity-90 transition"
          >
            + Add Package
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Price</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Services</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Actions</th>
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
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[250px]">
                            {pkg.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatCurrency(pkg.defaultPrice)}/mo
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
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(pkg)}
                          className="text-xs text-gray-500 hover:text-gray-800"
                        >
                          Edit
                        </button>
                        {pkg.active ? (
                          <button
                            onClick={() => handleDeactivate(pkg)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(pkg)}
                            className="text-xs text-green-600 hover:text-green-800"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
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
