/**
 * GET /api/dashboard/summary?month=YYYY-MM
 *
 * Returns a comprehensive spend + budget summary for the given month:
 *   - totalSpend        – sum of all transaction amounts in the month
 *   - totalBudget       – sum of configured category limits
 *   - totalRemaining    – totalBudget − totalSpend
 *   - topCategories     – top 5 categories by spend (with budget info when available)
 *   - overspentCategories – categories that have a limit and exceeded it
 *   - budgetLines       – all budgeted categories with spend vs limit
 *
 * All arithmetic is performed in lib/budget-utils (pure, unit-tested).
 * This route only does Prisma aggregation queries.
 *
 * Access:
 *   PARENT_ADMIN / PARENT – full access.
 *   TEEN                  – read-only summary (no overspent details shown, but full access here;
 *                           the caller/UI may choose to filter).
 *   KID                   – 403 (budgets are a parent concern).
 */
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { startOfMonth, endOfMonth } from "date-fns";
import {
  buildSpendingMap,
  computeDashboardSummary,
  type SpendingRow,
} from "@/lib/budget-utils";

export const GET = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID) {
    throw new ApiError(403, "Kids do not have access to budget summaries");
  }

  const url = new URL(req.url);
  const now = new Date();

  // Default to current month; accept YYYY-MM override
  const rawMonth =
    url.searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (!/^\d{4}-\d{2}$/.test(rawMonth)) {
    throw new ApiError(400, "month must be in YYYY-MM format");
  }

  const [yr, mo] = rawMonth.split("-").map(Number);
  const monthStart = startOfMonth(new Date(yr, mo - 1));
  const monthEnd = endOfMonth(new Date(yr, mo - 1));

  // -------------------------------------------------------------------------
  // 1. Spending aggregations (Prisma groupBy)
  // -------------------------------------------------------------------------
  const spendingAgg = await prisma.transaction.groupBy({
    by: ["categoryPrimary"],
    where: {
      familyId: actor.familyId,
      date: { gte: monthStart, lte: monthEnd },
      pending: false,
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });

  const spendingRows: SpendingRow[] = spendingAgg.map((s) => ({
    categoryPrimary: s.categoryPrimary,
    amount: Number(s._sum.amount ?? 0),
  }));

  // -------------------------------------------------------------------------
  // 2. Budget categories
  // -------------------------------------------------------------------------
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { familyId_month: { familyId: actor.familyId, month: rawMonth } },
    include: { categories: true },
  });

  const budgetCats = (budgetMonth?.categories ?? []).map((c) => ({
    categoryPrimary: c.categoryPrimary,
    limitAmount: Number(c.limitAmount),
  }));

  // -------------------------------------------------------------------------
  // 3. Pure calculation (unit-tested in lib/__tests__/budget-utils.test.ts)
  // -------------------------------------------------------------------------
  const summary = computeDashboardSummary(spendingRows, budgetCats);

  // Also expose a per-category spending map (useful for clients that want raw data)
  const spendingMap = buildSpendingMap(spendingRows);
  const spendingByCategory = Object.fromEntries(spendingMap);

  return Response.json({
    month: rawMonth,
    ...summary,
    spendingByCategory,
    budgetMonthId: budgetMonth?.id ?? null,
  });
});
