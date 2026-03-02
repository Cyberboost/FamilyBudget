import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Summary data for dashboard
  const [budgetSummary, recentTransactions, goals] = await Promise.all([
    prisma.budget.findMany({
      where: { familyId: member.familyId, year, month },
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

  const totalBudget = budgetSummary.reduce((a, b) => a + Number(b.limitAmount), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back{member.name ? `, ${member.name}` : ""}!
        </h1>
        <p className="text-gray-500 mt-1">
          {member.family.name} · {member.role.replace("_", " ")}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          label="Monthly Budget"
          value={`$${totalBudget.toFixed(2)}`}
          icon="📋"
          href="/budgets"
        />
        <StatCard
          label="Active Goals"
          value={String(goals.filter((g) => !g.isCompleted).length)}
          icon="🎯"
          href="/goals"
        />
        <StatCard
          label="Connected Banks"
          value="–"
          icon="🏦"
          href="/settings"
        />
      </div>

      {/* Recent transactions */}
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
                  <td className="py-2 text-gray-500">
                    {new Date(tx.date).toLocaleDateString()}
                  </td>
                  <td className="py-2 font-medium text-gray-800">{tx.name}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                      {tx.category ?? "Uncategorized"}
                    </span>
                  </td>
                  <td className="py-2 text-right font-medium">
                    ${Number(tx.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Goals preview */}
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
                      ${Number(goal.savedAmount).toFixed(0)} / ${Number(goal.targetAmount).toFixed(0)}
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

function StatCard({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: string;
  icon: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-indigo-300 transition"
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </Link>
  );
}
