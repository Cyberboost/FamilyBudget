import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GoalVisibility, SharedScope } from "@prisma/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { computeKidOverview, type GoalRow, type AllowanceRow, type CategorySpend } from "@/lib/goal-utils";
import { formatCategory } from "@/lib/categories";

export default async function KidsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({
    where: { clerkId: userId },
    include: { family: true },
  });
  if (!member) redirect("/dashboard");

  const isKidOrTeen = member.role === "KID" || member.role === "TEEN";

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  const now = new Date();
  const monthStr = format(now, "yyyy-MM");
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const scope = member.family.sharedScope;

  const [rawGoals, rawAllowance, spendAgg] = await Promise.all([
    prisma.goal.findMany({
      where: isKidOrTeen
        ? {
            familyId: member.familyId,
            OR: [
              { shares: { some: { clerkId: userId } } },
              { visibility: GoalVisibility.FAMILY },
            ],
          }
        : { familyId: member.familyId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.allowance.findUnique({
      where: { familyId_childUserId: { familyId: member.familyId, childUserId: userId } },
    }),
    scope !== SharedScope.NONE
      ? prisma.transaction.groupBy({
          by: ["categoryPrimary"],
          where: {
            familyId: member.familyId,
            date: { gte: monthStart, lte: monthEnd },
            pending: false,
          },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
        })
      : Promise.resolve([]),
  ]);

  const goalRows: GoalRow[] = rawGoals.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    targetAmount: Number(g.targetAmount),
    savedAmount: Number(g.savedAmount),
    targetDate: g.targetDate,
    isCompleted: g.isCompleted,
    visibility: g.visibility,
  }));

  const allowance: AllowanceRow | null = rawAllowance
    ? {
        id: rawAllowance.id,
        amount: Number(rawAllowance.amount),
        cadence: rawAllowance.cadence,
        jarsJson: rawAllowance.jarsJson as Record<string, number> | null,
      }
    : null;

  const spendRows: CategorySpend[] = (spendAgg as { categoryPrimary: string | null; _sum: { amount: unknown } }[]).map((s) => ({
    category: s.categoryPrimary ?? "Uncategorized",
    amount: Number(s._sum.amount ?? 0),
  }));

  const overview = computeKidOverview(goalRows, spendRows, allowance, now);

  const name = member.name ?? "there";
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-indigo-700">Hi, {name}! 👋</h1>
        <p className="text-gray-500 mt-1">Here are your goals and savings progress.</p>
      </div>

      {/* Goals */}
      {overview.goals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-gray-500">
            No goals have been shared with you yet. Ask a parent to share one!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {overview.goals.map((goal) => {
            const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
            return (
              <div
                key={goal.id}
                className={`bg-white rounded-2xl shadow border p-6 ${
                  goal.isCompleted ? "border-green-300 bg-green-50" : "border-indigo-100"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">{goal.isCompleted ? "🏆" : "⭐"}</div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-800">{goal.name}</h3>
                    {goal.type && (
                      <span className="text-xs text-indigo-500 uppercase">{goal.type}</span>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Saved</span>
                    <span className="font-bold text-indigo-700">
                      ${goal.savedAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-6 rounded-full transition-all flex items-center justify-end pr-2 text-xs text-white font-bold ${
                        goal.isCompleted ? "bg-green-500" : "bg-indigo-500"
                      }`}
                      style={{ width: `${Math.max(8, goal.pct)}%` }}
                    >
                      {Math.round(goal.pct)}%
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>$0</span>
                    <span>Goal: ${goal.targetAmount.toFixed(2)}</span>
                  </div>
                </div>

                {!goal.isCompleted && (
                  <div className="text-sm text-gray-600">
                    Still need: <strong className="text-gray-800">${remaining.toFixed(2)}</strong>
                  </div>
                )}

                {goal.daysLeft !== null && !goal.isCompleted && (
                  <div
                    className={`text-xs mt-2 ${
                      goal.daysLeft < 0
                        ? "text-red-500"
                        : goal.daysLeft < 14
                        ? "text-amber-500"
                        : "text-gray-400"
                    }`}
                  >
                    {goal.daysLeft < 0
                      ? `${Math.abs(goal.daysLeft)} days past target`
                      : `${goal.daysLeft} days to go`}
                  </div>
                )}

                {goal.isCompleted && (
                  <div className="mt-2 text-green-700 font-semibold text-sm">🎉 Goal complete!</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Allowance */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">💵</span>
          <div>
            <h2 className="font-semibold text-amber-800">Allowance</h2>
            {overview.monthlyAllowance !== null ? (
              <p className="text-sm text-amber-700">
                Your monthly allowance equivalent:{" "}
                <strong>${overview.monthlyAllowance.toFixed(2)}</strong>
                {allowance && (
                  <span className="ml-1 text-amber-600">
                    (${allowance.amount.toFixed(2)}/{allowance.cadence.toLowerCase()})
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm text-amber-700">
                Allowance tracking is coming soon! Your parents will be able to record your
                allowance here.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Shared spending summary */}
      {scope === SharedScope.NONE ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 text-gray-400">
            <span className="text-2xl">🔒</span>
            <p className="text-sm">
              Spending details are private. Ask a parent to enable shared spending visibility.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Family Spending — {monthLabel}</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {scope === SharedScope.SUMMARY ? "Summary view" : "Full view"}
            </span>
          </div>

          {overview.spendByCategory.length === 0 ? (
            <p className="text-sm text-gray-400">No spending recorded this month.</p>
          ) : (
            <div className="space-y-3">
              {overview.spendByCategory.map((row) => {
                const barPct =
                  overview.totalSpend > 0 ? (row.amount / overview.totalSpend) * 100 : 0;
                return (
                  <div key={row.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{formatCategory(row.category)}</span>
                      <span className="font-medium text-gray-800">${row.amount.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-indigo-400 transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-gray-100 flex justify-between text-sm font-semibold text-gray-700">
                <span>Total</span>
                <span>${overview.totalSpend.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
