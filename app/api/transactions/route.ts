/**
 * GET /api/transactions
 * List transactions for the family with pagination, search, and filters.
 *
 * Query params:
 *   month     – YYYY-MM format; filters to the calendar month (takes precedence
 *               over startDate/endDate when provided)
 *   q         – search by merchant name or transaction description
 *   search    – alias for q (backward-compat)
 *   category  – filter by categoryPrimary or userCategoryOverride
 *   accountId – filter by account
 *   startDate – ISO date string (used when month is not provided)
 *   endDate   – ISO date string (used when month is not provided)
 *   page      – page number (default 1)
 *   pageSize  – results per page (max 100, default 50)
 *
 * RBAC / shared_scope:
 *   PARENT / PARENT_ADMIN – full access.
 *   TEEN / KID             – respects family.sharedScope:
 *     NONE    → 403
 *     SUMMARY → aggregate totals by category (no individual rows)
 *     DETAIL  → full transaction list
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role, SharedScope } from "@prisma/client";

export const GET = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();

  const url = new URL((req as NextRequest).url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, parseInt(url.searchParams.get("pageSize") ?? "50"));
  const q = url.searchParams.get("q") ?? url.searchParams.get("search") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const month = url.searchParams.get("month") ?? undefined;
  const startDate = url.searchParams.get("startDate") ?? undefined;
  const endDate = url.searchParams.get("endDate") ?? undefined;

  // Base where clause — always scoped to the family
  const where: Record<string, unknown> = { familyId: actor.familyId };

  // Collect top-level AND conditions so that q + category can coexist
  const andConditions: Record<string, unknown>[] = [];

  if (q) {
    andConditions.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { merchantName: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (category) {
    andConditions.push({
      OR: [{ userCategoryOverride: category }, { categoryPrimary: category }],
    });
  }
  if (andConditions.length > 0) where.AND = andConditions;
  if (accountId) where.accountId = accountId;

  // Date range — month param takes precedence over startDate/endDate
  if (month) {
    const [yr, mo] = month.split("-").map(Number);
    if (!isNaN(yr) && !isNaN(mo)) {
      where.date = {
        gte: new Date(yr, mo - 1, 1),
        lt: new Date(yr, mo, 1), // exclusive upper bound
      };
    }
  } else if (startDate || endDate) {
    where.date = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  // -----------------------------------------------------------------
  // RBAC: teens/kids see only what the family has shared
  // -----------------------------------------------------------------
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    const family = await prisma.family.findUnique({
      where: { id: actor.familyId },
      select: { sharedScope: true },
    });
    const scope = family?.sharedScope ?? SharedScope.NONE;

    if (scope === SharedScope.NONE) {
      throw new ApiError(403, "Transactions are not shared with your account");
    }

    if (scope === SharedScope.SUMMARY) {
      // Return per-category totals only, no individual transaction rows
      const groups = await prisma.transaction.groupBy({
        by: ["categoryPrimary"],
        where: where as Parameters<typeof prisma.transaction.groupBy>[0]["where"],
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: "desc" } },
      });
      return Response.json({ sharedScope: scope, summary: groups });
    }
    // DETAIL falls through to the normal query below
  }

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { account: { select: { name: true, mask: true, type: true } } },
    }),
  ]);

  return Response.json({
    transactions,
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  });
});
