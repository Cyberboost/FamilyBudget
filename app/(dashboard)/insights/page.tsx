import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export default async function InsightsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");
  if (member.role === "KID") redirect("/kids");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = format(now, "yyyy-MM");

  const thisMonthStart = startOfMonth(new Date(year, month - 1));
  const thisMonthEnd = endOfMonth(new Date(year, month - 1));
  const lastMonthStart = startOfMonth(subMonths(new Date(year, month - 1), 1));
  const lastMonthEnd = endOfMonth(subMonths(new Date(year, month - 1), 1));

  const [thisMonth, lastMonth, budgetMonth] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryPrimary"],
      where: {
        familyId: member.familyId,
        date: { gte: thisMonthStart, lte: thisMonthEnd },
        pending: false,
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prisma.transaction.groupBy({
      by: ["categoryPrimary"],
      where: {
        familyId: member.familyId,
        date: { gte: lastMonthStart, lte: lastMonthEnd },
        pending: false,
      },
      _sum: { amount: true },
    }),
    prisma.budgetMonth.findUnique({
      where: { familyId_month: { familyId: member.familyId, month: monthStr } },
      include: { categories: true },
    }),
  ]);

  const budgets = budgetMonth?.categories ?? [];

  const lastMonthMap = new Map(
    lastMonth.map((s) => [s.categoryPrimary ?? "Uncategorized", Number(s._sum.amount ?? 0)])
  );

  const topCategories = thisMonth.slice(0, 8).map((s) => {
    const cat = s.categoryPrimary ?? "Uncategorized";
    const thisAmt = Number(s._sum.amount ?? 0);
    const lastAmt = lastMonthMap.get(cat) ?? 0;
    const delta = thisAmt - lastAmt;
    const pct = lastAmt > 0 ? (delta / lastAmt) * 100 : null;
    return { category: cat, thisAmt, lastAmt, delta, pct };
  });

  const totalThis = thisMonth.reduce((a, s) => a + Number(s._sum.amount ?? 0), 0);
  const totalLast = lastMonth.reduce((a, s) => a + Number(s._sum.amount ?? 0), 0);

  const daysElapsed = Math.min(now.getDate(), new Date(year, month, 0).getDate());
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthPct = daysElapsed / daysInMonth;

  const spendingMap = new Map(
    thisMonth.map((s) => [s.categoryPrimary ?? "Uncategorized", Number(s._sum.amount ?? 0)])
  );

  const burnRates = budgets.map((b) => {
    const spent = spendingMap.get(b.categoryPrimary) ?? 0;
    const limit = Number(b.limitAmount);
    const spendPct = limit > 0 ? spent / limit : 0;
    const burnRate = monthPct > 0 ? spendPct / monthPct : 0;
    return {
      category: b.categoryPrimary,
      limit,
      spent,
      burnRate,
      status: burnRate > 1.1 ? "overspending" : burnRate > 0.9 ? "on-track" : "under-budget",
    };
  });

  const monthName = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Insights – {monthName}</h1>

      {/* MoM summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">This month total</div>
          <div className="text-3xl font-bold text-gray-900">${totalThis.toFixed(2)}</div>
          <div
            className={`text-sm mt-1 ${totalThis > totalLast ? "text-red-500" : "text-green-600"}`}
          >
            {totalLast > 0
              ? `${totalThis > totalLast ? "▲" : "▼"} ${Math.abs(
                  ((totalThis - totalLast) / totalLast) * 100
                ).toFixed(1)}% vs last month`
              : "No prior month data"}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">Month progress</div>
          <div className="text-3xl font-bold text-gray-900">{Math.round(monthPct * 100)}%</div>
          <div className="text-sm text-gray-400 mt-1">
            Day {daysElapsed} of {daysInMonth}
          </div>
        </div>
      </div>

      {/* Top categories */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Top Spending Categories</h2>
        {topCategories.length === 0 ? (
          <p className="text-gray-400 text-sm">No spending data for this month.</p>
        ) : (
          <div className="space-y-3">
            {topCategories.map((cat) => (
              <div key={cat.category} className="flex items-center gap-4">
                <div className="w-32 text-sm text-gray-600 truncate">{cat.category}</div>
                <div className="flex-1">
                  <div
                    className="h-5 bg-indigo-100 rounded-full overflow-hidden"
                    style={{ position: "relative" }}
                  >
                    <div
                      className="h-5 bg-indigo-500 rounded-full"
                      style={{
                        width: `${
                          topCategories[0].thisAmt > 0
                            ? (cat.thisAmt / topCategories[0].thisAmt) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-sm font-medium w-20 text-right">${cat.thisAmt.toFixed(0)}</div>
                <div
                  className={`text-xs w-16 text-right ${
                    cat.delta > 0
                      ? "text-red-500"
                      : cat.delta < 0
                        ? "text-green-600"
                        : "text-gray-400"
                  }`}
                >
                  {cat.pct !== null
                    ? `${cat.delta > 0 ? "▲" : "▼"} ${Math.abs(cat.pct).toFixed(0)}%`
                    : "new"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Burn rates */}
      {burnRates.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Budget Burn Rate</h2>
          <div className="space-y-3">
            {burnRates.map((b) => (
              <div key={b.category} className="flex items-center gap-4">
                <div className="w-32 text-sm text-gray-600 truncate">{b.category}</div>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-5 rounded-full ${
                      b.status === "overspending"
                        ? "bg-red-500"
                        : b.status === "on-track"
                          ? "bg-amber-400"
                          : "bg-green-500"
                    }`}
                    style={{
                      width: `${b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="text-xs w-24 text-right text-gray-500">
                  ${b.spent.toFixed(0)} / ${b.limit.toFixed(0)}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    b.status === "overspending"
                      ? "bg-red-50 text-red-600"
                      : b.status === "on-track"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-green-50 text-green-600"
                  }`}
                >
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
