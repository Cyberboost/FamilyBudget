"use client";

import { useState } from "react";
import { PLAID_CATEGORIES, formatCategory } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_BUDGET_LIMIT = 0.01;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetCategoryLine {
  id: string;
  categoryPrimary: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  pct: number;
  overspent: boolean;
}

interface BudgetEditorProps {
  month: string; // YYYY-MM
  initialLines: BudgetCategoryLine[];
  /** Only parents may edit. */
  canEdit: boolean;
}

// ---------------------------------------------------------------------------
// Pure helper — recompute derived fields when limit changes
// ---------------------------------------------------------------------------

function recomputeLine(
  line: BudgetCategoryLine,
  newId: string,
  newLimit: number
): BudgetCategoryLine {
  const remaining = newLimit - line.spent;
  const pct = newLimit > 0 ? (line.spent / newLimit) * 100 : line.spent > 0 ? 100 : 0;
  return {
    ...line,
    id: newId,
    limitAmount: newLimit,
    remaining,
    pct,
    overspent: line.spent > newLimit,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BudgetEditor({ month, initialLines, canEdit }: BudgetEditorProps) {
  const [lines, setLines] = useState<BudgetCategoryLine[]>(initialLines);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<string>(PLAID_CATEGORIES[0]);
  const [limit, setLimit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ---------------------------------------------------------------------------
  // Edit inline state
  // ---------------------------------------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(limit);
    if (isNaN(amount) || amount < MIN_BUDGET_LIMIT) {
      setFormError(`Limit must be at least $${MIN_BUDGET_LIMIT}`);
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, categoryPrimary: category, limitAmount: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      // Merge into local state: update if exists, else add
      setLines((prev) => {
        const exists = prev.find((l) => l.categoryPrimary === category);
        if (exists) {
          return prev.map((l) =>
            l.categoryPrimary === category ? recomputeLine(l, data.id, amount) : l
          );
        }
        return [
          ...prev,
          {
            id: data.id,
            categoryPrimary: category,
            limitAmount: amount,
            spent: 0,
            remaining: amount,
            pct: 0,
            overspent: false,
          },
        ].sort((a, b) => a.categoryPrimary.localeCompare(b.categoryPrimary));
      });
      setShowForm(false);
      setLimit("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Edit save
  // ---------------------------------------------------------------------------

  async function saveEdit(line: BudgetCategoryLine) {
    const amount = parseFloat(editLimit);
    if (isNaN(amount) || amount < MIN_BUDGET_LIMIT) {
      setEditError(`Limit must be at least $${MIN_BUDGET_LIMIT}`);
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          categoryPrimary: line.categoryPrimary,
          limitAmount: amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setLines((prev) =>
        prev.map((l) =>
          l.categoryPrimary === line.categoryPrimary ? recomputeLine(l, data.id, amount) : l
        )
      );
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setEditSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete(id: string) {
    if (!confirm("Remove this budget category?")) return;
    try {
      const res = await fetch("/api/budgets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: id }),
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      setLines((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const totalBudget = lines.reduce((a, l) => a + l.limitAmount, 0);
  const totalSpent = lines.reduce((a, l) => a + l.spent, 0);
  const overallPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
  const overallOver = totalSpent > totalBudget && totalBudget > 0;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">Total Spent vs Budget</span>
            <span className={overallOver ? "text-red-600 font-bold" : "text-gray-800"}>
              ${totalSpent.toFixed(2)} / ${totalBudget.toFixed(2)}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${overallOver ? "bg-red-500" : "bg-indigo-500"}`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Category lines */}
      {lines.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          No budget limits set for this month.
          {canEdit && (
            <button
              onClick={() => setShowForm(true)}
              className="ml-2 text-indigo-600 hover:underline"
            >
              Add one →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {lines.map((line) =>
            editingId === line.id ? (
              <div key={line.id} className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium text-gray-800 min-w-[160px]">
                    {formatCategory(line.categoryPrimary)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">$</span>
                    <input
                      type="number"
                      min={MIN_BUDGET_LIMIT}
                      step={MIN_BUDGET_LIMIT}
                      value={editLimit}
                      onChange={(e) => setEditLimit(e.target.value)}
                      className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      autoFocus
                    />
                  </div>
                  {editError && <p className="text-xs text-red-600">{editError}</p>}
                  <button
                    onClick={() => saveEdit(line)}
                    disabled={editSaving}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={line.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-800">
                    {formatCategory(line.categoryPrimary)}
                  </span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={line.overspent ? "text-red-600 font-bold" : "text-gray-800"}>
                      ${line.spent.toFixed(2)}
                    </span>
                    <span className="text-gray-400">/ ${line.limitAmount.toFixed(2)}</span>
                    {line.overspent && (
                      <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded">
                        over ${Math.abs(line.remaining).toFixed(2)}
                      </span>
                    )}
                    {canEdit && (
                      <div className="flex gap-2 ml-2">
                        <button
                          onClick={() => {
                            setEditingId(line.id);
                            setEditLimit(String(line.limitAmount));
                            setEditError("");
                          }}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(line.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      line.overspent ? "bg-red-500" : line.pct > 80 ? "bg-amber-400" : "bg-indigo-500"
                    }`}
                    style={{ width: `${Math.min(100, line.pct)}%` }}
                  />
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Create form */}
      {canEdit && (
        <div>
          {showForm ? (
            <form
              onSubmit={handleCreate}
              className="bg-white rounded-xl shadow-sm border border-indigo-200 p-5 space-y-4"
            >
              <h3 className="text-sm font-semibold text-gray-700">Add Budget Limit</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {PLAID_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {formatCategory(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monthly Limit ($)</label>
                  <input
                    type="number"
                    min={MIN_BUDGET_LIMIT}
                    step={MIN_BUDGET_LIMIT}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="0.00"
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Add Limit"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setLimit("");
                    setFormError("");
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition"
            >
              + Add Budget Limit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
