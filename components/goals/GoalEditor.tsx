"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoalType = "SAVINGS" | "SPENDING" | "DEBT";
export type GoalVisibility = "PRIVATE" | "FAMILY" | "SHARED_WITH_MEMBERS";

export interface GoalItem {
  id: string;
  name: string;
  description?: string | null;
  type: GoalType;
  visibility: GoalVisibility;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string | null;
  isCompleted: boolean;
  shares: { clerkId: string }[];
}

interface GoalEditorProps {
  /** Pre-existing goals to display. */
  initialGoals: GoalItem[];
  /** Whether the current user is a parent and may create/edit/delete. */
  canEdit: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: "SAVINGS", label: "Savings" },
  { value: "SPENDING", label: "Spending" },
  { value: "DEBT", label: "Debt" },
];

const VISIBILITY_OPTIONS: { value: GoalVisibility; label: string; desc: string }[] = [
  { value: "FAMILY", label: "Family", desc: "All parents, teens, and kids" },
  { value: "SHARED_WITH_MEMBERS", label: "Specific members", desc: "Only selected family members" },
  { value: "PRIVATE", label: "Private", desc: "Only you (parents)" },
];

function progressPct(saved: number, target: number) {
  return target > 0 ? Math.min(100, (saved / target) * 100) : 0;
}

function daysLeftLabel(targetDate: string | null | undefined) {
  if (!targetDate) return null;
  const d = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (d < 0) return { text: `${Math.abs(d)} days overdue`, cls: "text-red-500" };
  if (d === 0) return { text: "Due today", cls: "text-amber-500" };
  if (d < 30) return { text: `${d} days left`, cls: "text-amber-500" };
  return { text: `${d} days left`, cls: "text-gray-400" };
}

const EMPTY_FORM = {
  name: "",
  description: "",
  type: "SAVINGS" as GoalType,
  visibility: "FAMILY" as GoalVisibility,
  targetAmount: "",
  savedAmount: "",
  targetDate: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalEditor({ initialGoals, canEdit }: GoalEditorProps) {
  const router = useRouter();
  const [goals, setGoals] = useState<GoalItem[]>(initialGoals);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  function setField<K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const targetAmount = parseFloat(form.targetAmount);
    const savedAmount = parseFloat(form.savedAmount || "0");
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (isNaN(targetAmount) || targetAmount <= 0) { setFormError("Target amount must be positive"); return; }
    if (isNaN(savedAmount) || savedAmount < 0) { setFormError("Saved amount must be ≥ 0"); return; }

    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || undefined,
          type: form.type,
          visibility: form.visibility,
          targetAmount,
          savedAmount,
          targetDate: form.targetDate ? new Date(form.targetDate).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create goal");
      setGoals((prev) => [{ ...data, shares: [] }, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Mark complete toggle
  // ---------------------------------------------------------------------------

  async function toggleComplete(goal: GoalItem) {
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !goal.isCompleted }),
      });
      if (!res.ok) throw new Error("Failed to update goal");
      setGoals((prev) =>
        prev.map((g) => (g.id === goal.id ? { ...g, isCompleted: !g.isCompleted } : g))
      );
    } catch {
      /* swallow for UI */
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete(id: string) {
    if (!confirm("Delete this goal permanently?")) return;
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Delete failed");
      }
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Goal cards */}
      {goals.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          {canEdit ? (
            <>
              No goals yet.{" "}
              <button onClick={() => setShowForm(true)} className="text-indigo-600 hover:underline">
                Create one →
              </button>
            </>
          ) : (
            "No goals have been shared with you yet."
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {goals.map((goal) => {
            const pct = progressPct(goal.savedAmount, goal.targetAmount);
            const dl = daysLeftLabel(goal.targetDate);
            return (
              <div
                key={goal.id}
                className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-3 ${
                  goal.isCompleted ? "border-green-200 bg-green-50" : "border-gray-200"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800 leading-tight">{goal.name}</h3>
                    {goal.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{goal.description}</p>
                    )}
                    <span className="text-xs text-gray-400 uppercase tracking-wide">
                      {goal.type}
                    </span>
                  </div>
                  {goal.isCompleted && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full shrink-0">
                      ✓ Done
                    </span>
                  )}
                </div>

                {/* Progress */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium text-gray-800">
                      ${goal.savedAmount.toFixed(2)} / ${goal.targetAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${goal.isCompleted ? "bg-green-500" : "bg-indigo-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-gray-400 mt-0.5">{Math.round(pct)}%</div>
                </div>

                {dl && !goal.isCompleted && (
                  <div className={`text-xs ${dl.cls}`}>{dl.text}</div>
                )}

                {/* Actions */}
                {canEdit && (
                  <div className="flex items-center gap-3 pt-1 border-t border-gray-100 flex-wrap">
                    <button
                      onClick={() => toggleComplete(goal)}
                      className="text-xs text-gray-500 hover:text-indigo-600 transition"
                    >
                      {goal.isCompleted ? "Mark incomplete" : "Mark complete"}
                    </button>
                    <button
                      onClick={() => router.push(`/goals/${goal.id}`)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Details / Share →
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="text-xs text-red-500 hover:underline ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create form */}
      {canEdit && (
        <div>
          {showForm ? (
            <form
              onSubmit={handleCreate}
              className="bg-white rounded-xl shadow-sm border border-indigo-200 p-6 space-y-4"
            >
              <h3 className="text-sm font-semibold text-gray-700">New Goal</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    maxLength={200}
                    placeholder="e.g. Family Vacation"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    required
                  />
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    maxLength={500}
                    placeholder="Short description"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setField("type", e.target.value as GoalType)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {GOAL_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Visibility */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Visibility</label>
                  <select
                    value={form.visibility}
                    onChange={(e) => setField("visibility", e.target.value as GoalVisibility)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {VISIBILITY_OPTIONS.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label} – {v.desc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Amount */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Target Amount ($) *</label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={form.targetAmount}
                    onChange={(e) => setField("targetAmount", e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    required
                  />
                </div>

                {/* Saved Amount */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Already Saved ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.savedAmount}
                    onChange={(e) => setField("savedAmount", e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                {/* Target Date */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Target Date (optional)</label>
                  <input
                    type="date"
                    value={form.targetDate}
                    onChange={(e) => setField("targetDate", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {submitting ? "Creating…" : "Create Goal"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(""); }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition"
            >
              + New Goal
            </button>
          )}
        </div>
      )}
    </div>
  );
}
