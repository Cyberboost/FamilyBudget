import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Suspense } from "react";
import { MonthPicker } from "@/components/transactions/MonthPicker";
import { BudgetEditor, type BudgetCategoryLine } from "@/components/budgets/BudgetEditor";
import { buildSpendingMap } from "@/lib/budget-utils";

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

  const [budgetMonth, spendingAgg] = await Promise.all([
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

  const spendingMap = buildSpendingMap(
    spendingAgg.map((s) => ({
      categoryPrimary: s.categoryPrimary,
      amount: Number(s._sum.amount ?? 0),
    }))
  );

  const initialLines: BudgetCategoryLine[] = (budgetMonth?.categories ?? []).map((c) => {
    const spent = spendingMap.get(c.categoryPrimary) ?? 0;
    const limit = Number(c.limitAmount);
    return {
      id: c.id,
      categoryPrimary: c.categoryPrimary,
      limitAmount: limit,
      spent,
      remaining: limit - spent,
      pct: limit > 0 ? Math.min(100, (spent / limit) * 100) : 0,
      overspent: spent > limit,
    };
  });

  const isParent = member.role === "PARENT" || member.role === "PARENT_ADMIN";
  const monthName = new Date(year, month - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Budgets – {monthName}</h1>
        <Suspense>
          <MonthPicker currentMonth={monthStr} basePath="/budgets" />
        </Suspense>
      </div>

      <BudgetEditor month={monthStr} initialLines={initialLines} canEdit={isParent} />
    </div>
  );
}
