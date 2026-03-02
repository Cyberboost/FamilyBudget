/**
 * GET /api/insights
 * Weekly insights (math-based, no AI):
 *   - Top spending categories this month
 *   - Month-over-month deltas per category
 *   - Budget burn rate (% of budget used vs % of month elapsed)
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  differenceInDays,
  getDaysInMonth,
} from "date-fns";

export const GET = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID) {
    throw new ApiError(403, "Access denied");
  }

  const url = new URL((req as NextRequest).url);
  const now = new Date();
  const year = parseInt(url.searchParams.get("year") ?? String(now.getFullYear()));
  const month = parseInt(url.searchParams.get("month") ?? String(now.getMonth() + 1));

  const thisMonthStart = startOfMonth(new Date(year, month - 1));
  const thisMonthEnd = endOfMonth(new Date(year, month - 1));
  const lastMonthStart = startOfMonth(subMonths(new Date(year, month - 1), 1));
  const lastMonthEnd = endOfMonth(subMonths(new Date(year, month - 1), 1));

  // Spending this month by category
  const thisMonthSpending = await prisma.transaction.groupBy({
    by: ["category"],
    where: {
      familyId: actor.familyId,
      date: { gte: thisMonthStart, lte: thisMonthEnd },
      pending: false,
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });

  // Spending last month by category
  const lastMonthSpending = await prisma.transaction.groupBy({
    by: ["category"],
    where: {
      familyId: actor.familyId,
      date: { gte: lastMonthStart, lte: lastMonthEnd },
      pending: false,
    },
    _sum: { amount: true },
  });

  const lastMonthMap = new Map(
    lastMonthSpending.map((s) => [
      s.category ?? "Uncategorized",
      Number(s._sum.amount ?? 0),
    ])
  );

  // Top categories with MoM delta
  const topCategories = thisMonthSpending.slice(0, 10).map((s) => {
    const cat = s.category ?? "Uncategorized";
    const thisAmt = Number(s._sum.amount ?? 0);
    const lastAmt = lastMonthMap.get(cat) ?? 0;
    const delta = thisAmt - lastAmt;
    const deltaPercent = lastAmt > 0 ? (delta / lastAmt) * 100 : null;
    return { category: cat, amount: thisAmt, lastMonthAmount: lastAmt, delta, deltaPercent };
  });

  // Budget burn rate
  const budgets = await prisma.budget.findMany({
    where: { familyId: actor.familyId, year, month },
  });

  const today = now < thisMonthEnd ? now : thisMonthEnd;
  const daysElapsed = differenceInDays(today, thisMonthStart) + 1;
  const daysInMonth = getDaysInMonth(thisMonthStart);
  const monthProgress = daysElapsed / daysInMonth;

  const spendingMap = new Map(
    thisMonthSpending.map((s) => [
      s.category ?? "Uncategorized",
      Number(s._sum.amount ?? 0),
    ])
  );

  const burnRates = budgets.map((b) => {
    const spent = spendingMap.get(b.category) ?? 0;
    const spendProgress = Number(b.limitAmount) > 0 ? spent / Number(b.limitAmount) : 0;
    const burnRate = monthProgress > 0 ? spendProgress / monthProgress : 0;
    return {
      category: b.category,
      limitAmount: Number(b.limitAmount),
      spent,
      monthProgress: Math.round(monthProgress * 100),
      spendProgress: Math.round(spendProgress * 100),
      burnRate: Math.round(burnRate * 100), // > 100 means overspending pace
      status:
        burnRate > 1.1
          ? "overspending"
          : burnRate > 0.9
            ? "on-track"
            : "under-budget",
    };
  });

  // Total this month vs last month
  const totalThisMonth = thisMonthSpending.reduce(
    (acc, s) => acc + Number(s._sum.amount ?? 0),
    0
  );
  const totalLastMonth = lastMonthSpending.reduce(
    (acc, s) => acc + Number(s._sum.amount ?? 0),
    0
  );

  return Response.json({
    period: { year, month, daysElapsed, daysInMonth },
    topCategories,
    burnRates,
    totals: {
      thisMonth: totalThisMonth,
      lastMonth: totalLastMonth,
      delta: totalThisMonth - totalLastMonth,
      deltaPercent:
        totalLastMonth > 0
          ? ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100
          : null,
    },
  });
});
