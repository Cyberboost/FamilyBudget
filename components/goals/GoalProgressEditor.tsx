"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface GoalProgressEditorProps {
  goalId: string;
  savedAmount: number;
  targetAmount: number;
  isCompleted: boolean;
}

export function GoalProgressEditor({
  goalId,
  savedAmount: initialSaved,
  targetAmount,
  isCompleted: initialCompleted,
}: GoalProgressEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [savedAmount, setSavedAmount] = useState(String(initialSaved));
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(savedAmount);
    if (isNaN(amount) || amount < 0) {
      setError("Saved amount must be ≥ 0");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedAmount: amount, isCompleted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-sm text-indigo-600 hover:underline mt-1"
      >
        Update progress / mark complete →
      </button>
    );
  }

  return (
    <form onSubmit={handleSave} className="border-t border-gray-100 pt-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Update Progress</h3>
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Saved Amount ($) — target ${targetAmount.toFixed(2)}
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={savedAmount}
            onChange={(e) => setSavedAmount(e.target.value)}
            className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={isCompleted}
            onChange={(e) => setIsCompleted(e.target.checked)}
            className="accent-indigo-600 w-4 h-4"
          />
          Mark as complete
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setError(""); }}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
