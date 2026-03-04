/**
 * GET /api/kid/overview?month=YYYY-MM
 *
 * Returns a kid-friendly summary for the authenticated user:
 *   - goals     – goals shared with them or visibility=FAMILY, with progress metrics
 *   - allowance – their allowance record (if any), monthly equivalent
 *   - spendByCategory – spend this month (categories shown depend on family sharedScope)
 *   - totalSpend
 *
 * Access:
 *   KID / TEEN  – own data only.
 *   PARENT+     – can call on behalf of any member (pass ?childClerkId= to preview).
 *
 * All calculations delegated to lib/goal-utils (pure, unit-tested).
 */
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role, GoalVisibility, SharedScope } from "@prisma/client";
import { startOfMonth, endOfMonth } from "date-fns";
import {
  computeKidOverview,
  type GoalRow,
  type CategorySpend,
  type AllowanceRow,
} from "@/lib/goal-utils";

export const GET = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();

  const url = new URL(req.url);
  const now = new Date();
  const rawMonth =
    url.searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (!/^\d{4}-\d{2}$/.test(rawMonth)) {
    throw new ApiError(400, "month must be in YYYY-MM format");
  }

  // Parents may preview any kid's view; kids can only see their own
  const childClerkIdParam = url.searchParams.get("childClerkId");
  let targetClerkId = actor.clerkId;

  if (childClerkIdParam) {
    if (actor.role !== Role.PARENT && actor.role !== Role.PARENT_ADMIN) {
      throw new ApiError(403, "Only parents may view another member's overview");
    }
    // Verify the requested member belongs to the same family
    const childMember = await prisma.familyMember.findFirst({
      where: { familyId: actor.familyId, clerkId: childClerkIdParam },
    });
    if (!childMember) throw new ApiError(404, "Member not found in this family");
    targetClerkId = childClerkIdParam;
  } else if (actor.role !== Role.KID && actor.role !== Role.TEEN) {
    // Parents calling without childClerkId get their own overview but with all family data
    // (mainly useful for preview purposes)
  }

  const [yr, mo] = rawMonth.split("-").map(Number);
  const monthStart = startOfMonth(new Date(yr, mo - 1));
  const monthEnd = endOfMonth(new Date(yr, mo - 1));

  // -------------------------------------------------------------------------
  // 1. Goals visible to this kid/teen
  // -------------------------------------------------------------------------
  const rawGoals = await prisma.goal.findMany({
    where: {
      familyId: actor.familyId,
      OR: [
        { shares: { some: { clerkId: targetClerkId } } },
        { visibility: GoalVisibility.FAMILY },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

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

  // -------------------------------------------------------------------------
  // 2. Allowance
  // -------------------------------------------------------------------------
  const rawAllowance = await prisma.allowance.findUnique({
    where: { familyId_childUserId: { familyId: actor.familyId, childUserId: targetClerkId } },
  });

  const allowance: AllowanceRow | null = rawAllowance
    ? {
        id: rawAllowance.id,
        amount: Number(rawAllowance.amount),
        cadence: rawAllowance.cadence,
        jarsJson: rawAllowance.jarsJson as Record<string, number> | null,
      }
    : null;

  // -------------------------------------------------------------------------
  // 3. Spending — filtered by sharedScope
  // -------------------------------------------------------------------------
  const family = await prisma.family.findUnique({ where: { id: actor.familyId } });
  const scope = family?.sharedScope ?? SharedScope.NONE;

  let spendRows: CategorySpend[] = [];

  if (scope !== SharedScope.NONE) {
    const spendAgg = await prisma.transaction.groupBy({
      by: ["categoryPrimary"],
      where: {
        familyId: actor.familyId,
        date: { gte: monthStart, lte: monthEnd },
        pending: false,
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    });
    spendRows = spendAgg.map((s) => ({
      category: s.categoryPrimary ?? "Uncategorized",
      amount: Number(s._sum.amount ?? 0),
    }));
  }

  // -------------------------------------------------------------------------
  // 4. Pure calculation
  // -------------------------------------------------------------------------
  const overview = computeKidOverview(goalRows, spendRows, allowance, now);

  return Response.json({
    month: rawMonth,
    sharedScope: scope,
    ...overview,
  });
});
