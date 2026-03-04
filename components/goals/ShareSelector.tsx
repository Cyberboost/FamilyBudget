"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareableMember {
  clerkId: string;
  name: string | null;
  email: string;
  role: string;
}

interface ShareSelectorProps {
  goalId: string;
  /** All kids/teens in the family. */
  members: ShareableMember[];
  /** Currently-shared clerkIds. */
  initialSharedWith: string[];
  /** Called after a successful save. */
  onSaved?: (sharedWith: string[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareSelector({ goalId, members, initialSharedWith, onSaved }: ShareSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSharedWith));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function toggle(clerkId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clerkId)) {
        next.delete(clerkId);
      } else {
        next.add(clerkId);
      }
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const sharedWith = [...selected];
      const res = await fetch(`/api/goals/${goalId}/share`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWith }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update sharing");
      setSaved(true);
      onSaved?.(sharedWith);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No kids or teens in this family yet. Invite family members to share goals with them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Choose which family members can see this goal:
      </p>
      <div className="space-y-2">
        {members.map((m) => (
          <label
            key={m.clerkId}
            className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-200 transition"
          >
            <input
              type="checkbox"
              checked={selected.has(m.clerkId)}
              onChange={() => toggle(m.clerkId)}
              className="accent-indigo-600 w-4 h-4"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">{m.name ?? m.email}</div>
              <div className="text-xs text-gray-400">{m.role.replace("_", " ")} · {m.email}</div>
            </div>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">✓ Sharing updated</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Sharing"}
      </button>
    </div>
  );
}
