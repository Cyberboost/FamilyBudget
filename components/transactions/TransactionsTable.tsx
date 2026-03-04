"use client";

import { useState } from "react";
import { formatCategory } from "@/lib/categories";
import { TransactionDrawer, type DrawerTransaction } from "./TransactionDrawer";

interface TransactionsTableProps {
  initialTransactions: DrawerTransaction[];
}

/**
 * Client component — renders the transaction table with row-click drawer.
 * Receives initial data from the server component; manages its own copy
 * so that saves (category override / note) are reflected instantly.
 */
export function TransactionsTable({ initialTransactions }: TransactionsTableProps) {
  const [transactions, setTransactions] = useState<DrawerTransaction[]>(initialTransactions);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedTx = transactions.find((t) => t.id === selectedId) ?? null;

  function handleSave(updated: DrawerTransaction) {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
        No transactions found for this period.
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((tx) => {
              const effectiveCat = tx.userCategoryOverride ?? tx.categoryPrimary ?? "Uncategorized";
              const amount = Number(tx.amount);
              return (
                <tr
                  key={tx.id}
                  onClick={() => setSelectedId(tx.id)}
                  className="hover:bg-indigo-50/40 transition cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedId(tx.id)}
                  aria-label={`Open details for ${tx.name}`}
                >
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(tx.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{tx.name}</span>
                    {tx.pending && (
                      <span className="ml-2 text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">
                        pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {tx.account.name}
                    {tx.account.mask ? ` ····${tx.account.mask}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs">
                      {formatCategory(effectiveCat)}
                    </span>
                    {tx.userCategoryOverride && (
                      <span className="ml-1 text-gray-400 text-xs" title="Manually set">
                        ✎
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">
                    {tx.note ?? ""}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-semibold ${amount < 0 ? "text-green-600" : "text-gray-900"}`}
                    >
                      {amount < 0 ? "+" : ""}${Math.abs(amount).toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedTx && (
        <TransactionDrawer
          transaction={selectedTx}
          onClose={() => setSelectedId(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
