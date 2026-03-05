"use client";

import { useEffect, useState } from "react";
import { PLAID_CATEGORIES, formatCategory } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryRule {
  id: string;
  matchType: "CONTAINS" | "STARTS_WITH" | "REGEX";
  matchValue: string;
  categoryPrimary: string;
  categoryDetailed: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  matchType: "CONTAINS" as "CONTAINS" | "STARTS_WITH" | "REGEX",
  matchValue: "",
  categoryPrimary: "FOOD_AND_DRINK",
  categoryDetailed: "",
  priority: 0,
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function RulesPage() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit state — keyed by rule id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CategoryRule>>({});
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  // -------------------------------------------------------------------------
  // Load rules
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("Failed to load rules");
      setRules(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.matchValue.trim()) {
      setFormError("Match value is required");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchType: form.matchType,
          matchValue: form.matchValue.trim(),
          categoryPrimary: form.categoryPrimary,
          categoryDetailed: form.categoryDetailed.trim() || undefined,
          priority: form.priority,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create rule");
      setRules((prev) => [data, ...prev]);
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Edit / deactivate
  // -------------------------------------------------------------------------

  function startEdit(rule: CategoryRule) {
    setEditingId(rule.id);
    setEditForm({
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      categoryPrimary: rule.categoryPrimary,
      categoryDetailed: rule.categoryDetailed,
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setEditError("");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setRules((prev) => prev.map((r) => (r.id === id ? data : r)));
      setEditingId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: CategoryRule) {
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setRules((prev) => prev.map((r) => (r.id === rule.id ? data : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  async function handleDelete(id: string) {
    if (!confirm("Delete this rule permanently?")) return;
    try {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Category Rules</h1>
          <p className="text-gray-500 text-sm mt-1">
            Rules auto-classify new transactions by merchant name. Higher priority runs first.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          {showCreate ? "Cancel" : "+ New Rule"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-gray-800">Create New Rule</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Match Type">
              <select
                value={form.matchType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    matchType: e.target.value as typeof form.matchType,
                  }))
                }
                className={selectCls}
              >
                <option value="CONTAINS">Contains</option>
                <option value="STARTS_WITH">Starts With</option>
                <option value="REGEX">Regex</option>
              </select>
            </FormField>

            <FormField label="Match Value">
              <input
                type="text"
                value={form.matchValue}
                onChange={(e) => setForm((f) => ({ ...f, matchValue: e.target.value }))}
                placeholder="e.g. starbucks"
                className={inputCls}
                required
              />
            </FormField>

            <FormField label="Category">
              <select
                value={form.categoryPrimary}
                onChange={(e) => setForm((f) => ({ ...f, categoryPrimary: e.target.value }))}
                className={selectCls}
              >
                {PLAID_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {formatCategory(c)}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Priority (higher = first)">
              <input
                type="number"
                min={0}
                max={1000}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className={inputCls}
              />
            </FormField>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Rule"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setForm(EMPTY_FORM);
              }}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Global error */}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Rules list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading rules…</div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No rules yet.{" "}
            <button
              onClick={() => setShowCreate(true)}
              className="text-indigo-600 hover:underline"
            >
              Create your first rule
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-center">Priority</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule) =>
                editingId === rule.id ? (
                  <EditRow
                    key={rule.id}
                    form={editForm}
                    onChange={setEditForm}
                    onSave={() => saveEdit(rule.id)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                    error={editError}
                  />
                ) : (
                  <tr key={rule.id} className={rule.isActive ? "" : "opacity-50"}>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-1.5">
                        {rule.matchType}
                      </span>
                      <span className="font-medium text-gray-800">{rule.matchValue}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs">
                        {formatCategory(rule.categoryPrimary)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{rule.priority}</td>
                    <td className="px-4 py-3 text-center">
                      {rule.isActive ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                          active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(rule)}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(rule)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          {rule.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
const selectCls = inputCls;

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

interface EditRowProps {
  form: Partial<CategoryRule>;
  onChange: (f: Partial<CategoryRule>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}

function EditRow({ form, onChange, onSave, onCancel, saving, error }: EditRowProps) {
  return (
    <tr className="bg-indigo-50/40">
      <td className="px-4 py-3" colSpan={5}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Match Type</label>
            <select
              value={form.matchType ?? "CONTAINS"}
              onChange={(e) =>
                onChange({ ...form, matchType: e.target.value as CategoryRule["matchType"] })
              }
              className={selectCls}
            >
              <option value="CONTAINS">Contains</option>
              <option value="STARTS_WITH">Starts With</option>
              <option value="REGEX">Regex</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Match Value</label>
            <input
              type="text"
              value={form.matchValue ?? ""}
              onChange={(e) => onChange({ ...form, matchValue: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select
              value={form.categoryPrimary ?? ""}
              onChange={(e) => onChange({ ...form, categoryPrimary: e.target.value })}
              className={selectCls}
            >
              {PLAID_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {formatCategory(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priority</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={form.priority ?? 0}
              onChange={(e) => onChange({ ...form, priority: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
