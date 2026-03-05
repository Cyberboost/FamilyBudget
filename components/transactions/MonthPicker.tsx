"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface MonthPickerProps {
  currentMonth: string; // YYYY-MM
  /** Base path for navigation (default: "/transactions"). */
  basePath?: string;
}

/**
 * Client component — renders prev/current/next month navigation.
 * Updates the URL `month` query param on change, preserving other params.
 */
export function MonthPicker({ currentMonth, basePath = "/transactions" }: MonthPickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(delta: -1 | 1) {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", newMonth);
    params.delete("page"); // reset pagination when month changes
    router.push(`${basePath}?${params.toString()}`);
  }

  const [y, m] = currentMonth.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate(-1)}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition text-sm"
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="text-lg font-semibold text-gray-800 min-w-[150px] text-center">{label}</span>
      <button
        onClick={() => navigate(1)}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition text-sm"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
