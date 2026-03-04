"use client";

import { useEffect, useRef, useState } from "react";
import { PLAID_CATEGORIES, formatCategory } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Types — local mirrors so the component doesn't import from @prisma/client
// ---------------------------------------------------------------------------

export interface DrawerTransaction {
  id: string;
  date: Date | string;
  name: string;
  merchantName: string | null;
  amount: number | string;
  isoCurrencyCode: string | null;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  userCategoryOverride: string | null;
  note: string | null;
  pending: boolean;
  account: { name: string; mask: string | null; type: string };
}

interface TransactionDrawerProps {
  transaction: DrawerTransaction;
  onClose: () => void;
  onSave: (updated: DrawerTransaction) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionDrawer({ transaction: tx, onClose, onSave }: TransactionDrawerProps) {
  const [category, setCategory] = useState(tx.userCategoryOverride ?? tx.categoryPrimary ?? "");
  const [note, setNote] = useState(tx.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const drawerRef = useRef<HTMLDivElement>(null);

  // Sync local state when the selected transaction changes
  useEffect(() => {
    setCategory(tx.userCategoryOverride ?? tx.categoryPrimary ?? "");
    setNote(tx.note ?? "");
    setError("");
  }, [tx.id, tx.userCategoryOverride, tx.categoryPrimary, tx.note]);

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category || undefined,
          note: note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSave({ ...tx, userCategoryOverride: category || null, note });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  const effectiveCategory = tx.userCategoryOverride ?? tx.categoryPrimary ?? "Uncategorized";
  const dateStr = new Date(tx.date).toLocaleDateString("default", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const amountNum = Number(tx.amount);
  const currency = tx.isoCurrencyCode ?? "USD";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 leading-snug">{tx.name}</h2>
            {tx.merchantName && tx.merchantName !== tx.name && (
              <p className="text-sm text-gray-400 mt-0.5">{tx.merchantName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 text-gray-400 hover:text-gray-600 transition text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Details */}
        <div className="p-6 space-y-5 flex-1">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-4">
            <Detail label="Amount">
              <span className={`text-xl font-bold ${amountNum < 0 ? "text-green-600" : "text-gray-900"}`}>
                {amountNum < 0 ? "+" : ""}
                {Math.abs(amountNum).toLocaleString("en-US", {
                  style: "currency",
                  currency,
                })}
              </span>
            </Detail>
            <Detail label="Date">
              <span className="text-gray-700">{dateStr}</span>
            </Detail>
            <Detail label="Account">
              <span className="text-gray-700">
                {tx.account.name}
                {tx.account.mask ? ` ····${tx.account.mask}` : ""}
              </span>
            </Detail>
            <Detail label="Status">
              {tx.pending ? (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                  Pending
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                  Posted
                </span>
              )}
            </Detail>
          </div>

          {/* Current category */}
          <Detail label="Current Category">
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs">
              {formatCategory(effectiveCategory)}
            </span>
            {tx.userCategoryOverride && (
              <span className="ml-2 text-xs text-gray-400">(manually set)</span>
            )}
          </Detail>

          {/* Divider */}
          <hr className="border-gray-100" />

          {/* Category override */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Override Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">— Use Plaid category —</option>
              {PLAID_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {formatCategory(cat)}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Note / Memo
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Add a note…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-0.5">{note.length}/500</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Small helper
// ---------------------------------------------------------------------------

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}
