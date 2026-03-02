import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, format } from "date-fns";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");
  if (member.role === "KID") redirect("/kids");

  const { month: monthParam } = await searchParams;
  const now = new Date();
  const monthStr = monthParam ?? format(now, "yyyy-MM");
  const [year, month] = monthStr.split("-").map(Number);

  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));

  const [budgetMonth, spendingByCategory] = await Promise.all([
    prisma.budgetMonth.findUnique({
      where: { familyId_month: { familyId: member.familyId, month: monthStr } },
      include: { categories: { orderBy: { categoryPrimary: "asc" } } },
    }),
    prisma.transaction.groupBy({
      by: ["categoryPrimary"],
      where: {
        familyId: member.familyId,
        date: { gte: monthStart, lte: monthEnd },
        pending: false,
      },
      _sum: { amount: true },
    }),
  ]);

  const budgetCategories = budgetMonth?.categories ?? [];

  const spendingMap = new Map(
    spendingByCategory.map((s) => [
      s.categoryPrimary ?? "Uncategorized",
      Number(s._sum.amount ?? 0),
    ])
  );

  const budgetRows = budgetCategories.map((c) => {
    const spent = spendingMap.get(c.categoryPrimary) ?? 0;
    const limit = Number(c.limitAmount);
    return {
      ...c,
      spent,
      remaining: limit - spent,
      pct: limit > 0 ? Math.min(100, (spent / limit) * 100) : 0,
      overspent: spent > limit,
    };
  });

  const totalLimit = budgetRows.reduce((a, b) => a + Number(b.limitAmount), 0);
  const totalSpent = budgetRows.reduce((a, b) => a + b.spent, 0);
  const monthName = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Budgets – {monthName}</h1>
        {(member.role === "PARENT" || member.role === "PARENT_ADMIN") && (
          <a
            href="/budgets/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            + Add Budget
          </a>
        )}
      </div>

      {/* Summary bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Total Spent</span>
          <span className={totalSpent > totalLimit ? "text-red-600 font-bold" : "text-gray-800"}>
            ${totalSpent.toFixed(2)} / ${totalLimit.toFixed(2)}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${
              totalSpent > totalLimit ? "bg-red-500" : "bg-indigo-500"
            }`}
            style={{
              width: `${totalLimit > 0 ? Math.min(100, (totalSpent / totalLimit) * 100) : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Budget rows */}
      {budgetRows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          No budgets set for this month.
          {(member.role === "PARENT" || member.role === "PARENT_ADMIN") && (
            <a href="/budgets/new" className="ml-2 text-indigo-600 hover:underline">
              Add one →
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {budgetRows.map((b) => (
            <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-800">{b.categoryPrimary}</span>
                <div className="text-sm text-right">
                  <span className={b.overspent ? "text-red-600 font-bold" : "text-gray-800"}>
                    ${b.spent.toFixed(2)}
                  </span>
                  <span className="text-gray-400"> / ${Number(b.limitAmount).toFixed(2)}</span>
                  {b.overspent && (
                    <span className="ml-2 px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded">
                      over by ${(b.spent - Number(b.limitAmount)).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    b.overspent ? "bg-red-500" : b.pct > 80 ? "bg-amber-400" : "bg-indigo-500"
                  }`}
                  style={{ width: `${b.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
