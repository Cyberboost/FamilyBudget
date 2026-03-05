import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { computeDashboardSummary } from "@/lib/budget-utils";
import { formatCategory } from "@/lib/categories";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({
    where: { clerkId: userId },
    include: { family: true },
  });

  if (!member) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Welcome to FamilyBudget!</h1>
        <p className="text-gray-500 mb-8">
          You are not yet a member of a family workspace. Create one or accept an invitation.
        </p>
        <Link
          href="/onboarding"
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
        >
          Create Family Workspace
        </Link>
      </div>
    );
  }

  const now = new Date();
  const monthStr = format(now, "yyyy-MM");
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [budgetMonth, spendingAgg, recentTransactions, goals] = await Promise.all([
    prisma.budgetMonth.findUnique({
      where: { familyId_month: { familyId: member.familyId, month: monthStr } },
      include: { categories: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryPrimary"],
      where: {
        familyId: member.familyId,
        date: { gte: monthStart, lte: monthEnd },
        pending: false,
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prisma.transaction.findMany({
      where: { familyId: member.familyId },
      orderBy: { date: "desc" },
      take: 5,
      include: { account: { select: { name: true } } },
    }),
    prisma.goal.findMany({
      where: { familyId: member.familyId },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  const spendingRows = spendingAgg.map((s) => ({
    categoryPrimary: s.categoryPrimary,
    amount: Number(s._sum.amount ?? 0),
  }));

  const budgetCats = (budgetMonth?.categories ?? []).map((c) => ({
    categoryPrimary: c.categoryPrimary,
    limitAmount: Number(c.limitAmount),
  }));

  const summary = computeDashboardSummary(spendingRows, budgetCats, 5);

  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      {/* Welcome row */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back{member.name ? `, ${member.name}` : ""}!
        </h1>
        <p className="text-gray-500 mt-1">
          {member.family.name} · {member.role.replace("_", " ")} · {monthLabel}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4 Summary tiles                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Tile 1: Total spend this month */}
        <SummaryTile
          label="Total Spend"
          sublabel={monthLabel}
          value={`$${summary.totalSpend.toFixed(2)}`}
          icon="💳"
          href="/transactions"
          accent="indigo"
        />

        {/* Tile 2: Remaining budget */}
        {summary.totalBudget > 0 ? (
          <SummaryTile
            label="Remaining Budget"
            sublabel={`of $${summary.totalBudget.toFixed(2)} set`}
            value={`$${Math.abs(summary.totalRemaining).toFixed(2)}`}
            icon={summary.totalRemaining >= 0 ? "✅" : "⚠️"}
            href="/budgets"
            accent={summary.totalRemaining >= 0 ? "green" : "red"}
            note={summary.totalRemaining < 0 ? "over budget" : undefined}
          />
        ) : (
          <SummaryTile
            label="Remaining Budget"
            sublabel="No budget set"
            value="—"
            icon="📋"
            href="/budgets"
            accent="gray"
          />
        )}

        {/* Tile 3: Overspent categories count */}
        <SummaryTile
          label="Overspent Categories"
          sublabel="this month"
          value={String(summary.overspentCategories.length)}
          icon={summary.overspentCategories.length > 0 ? "🔴" : "🟢"}
          href="/budgets"
          accent={summary.overspentCategories.length > 0 ? "red" : "green"}
        />

        {/* Tile 4: Active goals */}
        <SummaryTile
          label="Active Goals"
          sublabel="in progress"
          value={String(goals.filter((g) => !g.isCompleted).length)}
          icon="🎯"
          href="/goals"
          accent="indigo"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Top 5 categories by spend                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Top Categories This Month</h2>
          <Link href="/transactions" className="text-sm text-indigo-600 hover:underline">
            View transactions →
          </Link>
        </div>
        {summary.topCategories.length === 0 ? (
          <p className="text-gray-400 text-sm">No spending data yet.</p>
        ) : (
          <div className="space-y-3">
            {summary.topCategories.map((cat) => {
              const barPct =
                summary.totalSpend > 0 ? (cat.spent / summary.totalSpend) * 100 : 0;
              const limitPct = cat.limit
                ? Math.min(100, (cat.spent / cat.limit) * 100)
                : null;
              return (
                <div key={cat.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">
                      {formatCategory(cat.category)}
                    </span>
                    <div className="flex items-center gap-2 text-right">
                      <span className="font-medium text-gray-800">
                        ${cat.spent.toFixed(2)}
                      </span>
                      {cat.limit !== null && (
                        <span className="text-gray-400 text-xs">/ ${cat.limit.toFixed(2)}</span>
                      )}
                      {cat.overspent && (
                        <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded">
                          over
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Two-layer bar: share-of-total (gray bg) + limit progress (colored) */}
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        cat.overspent
                          ? "bg-red-500"
                          : limitPct !== null && limitPct > 80
                          ? "bg-amber-400"
                          : "bg-indigo-500"
                      }`}
                      style={{ width: `${limitPct ?? barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Overspent categories (alert list)                                   */}
      {/* ------------------------------------------------------------------ */}
      {summary.overspentCategories.length > 0 && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">⚠️</span>
            <h2 className="text-base font-semibold text-red-800">
              {summary.overspentCategories.length} categor
              {summary.overspentCategories.length === 1 ? "y" : "ies"} over budget
            </h2>
          </div>
          <div className="space-y-2">
            {summary.overspentCategories.map((cat) => (
              <div key={cat.category} className="flex justify-between items-center text-sm">
                <span className="text-red-700 font-medium">{formatCategory(cat.category)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-red-600">${cat.spent.toFixed(2)}</span>
                  <span className="text-red-400">/ ${(cat.limit ?? 0).toFixed(2)}</span>
                  <span className="font-semibold text-red-700">
                    +${Math.abs((cat.remaining ?? 0)).toFixed(2)} over
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Link href="/budgets" className="mt-4 inline-block text-xs text-red-600 hover:underline">
            Manage budgets →
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Recent transactions                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Recent Transactions</h2>
          <Link href="/transactions" className="text-sm text-indigo-600 hover:underline">
            View all →
          </Link>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No transactions yet.{" "}
            <Link href="/settings" className="text-indigo-600 hover:underline">
              Connect a bank account
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2">Date</th>
                <th className="pb-2">Merchant</th>
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-2 text-gray-500">{new Date(tx.date).toLocaleDateString()}</td>
                  <td className="py-2 font-medium text-gray-800">{tx.name}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                      {formatCategory(tx.userCategoryOverride ?? tx.categoryPrimary ?? "Other")}
                    </span>
                  </td>
                  <td className="py-2 text-right font-medium">${Number(tx.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Goals preview                                                       */}
      {/* ------------------------------------------------------------------ */}
      {goals.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Goals</h2>
            <Link href="/goals" className="text-sm text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-4">
            {goals.map((goal) => {
              const progress = Math.min(
                100,
                (Number(goal.savedAmount) / Number(goal.targetAmount)) * 100
              );
              return (
                <div key={goal.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800">{goal.name}</span>
                    <span className="text-gray-500">
                      ${Number(goal.savedAmount).toFixed(0)} /{" "}
                      ${Number(goal.targetAmount).toFixed(0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard / SummaryTile helpers
// ---------------------------------------------------------------------------

function SummaryTile({
  label,
  sublabel,
  value,
  icon,
  href,
  accent,
  note,
}: {
  label: string;
  sublabel: string;
  value: string;
  icon: string;
  href: string;
  accent: "indigo" | "green" | "red" | "gray";
  note?: string;
}) {
  const accentCls = {
    indigo: "text-indigo-700",
    green: "text-green-700",
    red: "text-red-700",
    gray: "text-gray-500",
  }[accent];

  return (
    <Link
      href={href}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-indigo-300 transition flex flex-col gap-1"
    >
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <span className="text-xl">{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold mt-1 ${accentCls}`}>{value}</div>
      <div className="text-xs text-gray-400">{sublabel}</div>
      {note && <div className="text-xs font-medium text-red-500">{note}</div>}
    </Link>
  );
}
