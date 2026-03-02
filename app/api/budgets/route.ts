/**
 * GET  /api/budgets?year=YYYY&month=M  – list budgets with spending totals
 * POST /api/budgets                    – create/update budget limit (PARENT+)
 * DELETE /api/budgets                  – delete a budget (PARENT_ADMIN)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, requireRole, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";
import { startOfMonth, endOfMonth } from "date-fns";

export const GET = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();

  // Kids don't see full budgets; see /api/goals for their view
  if (actor.role === Role.KID) {
    throw new ApiError(403, "Access denied");
  }

  const url = new URL((req as NextRequest).url);
  const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get("month") ?? String(new Date().getMonth() + 1));

  if (month < 1 || month > 12) throw new ApiError(400, "Invalid month");

  const budgets = await prisma.budget.findMany({
    where: { familyId: actor.familyId, year, month },
    orderBy: { category: "asc" },
  });

  // Calculate spending per category for this month
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));

  const spendingByCategory = await prisma.transaction.groupBy({
    by: ["category"],
    where: {
      familyId: actor.familyId,
      date: { gte: monthStart, lte: monthEnd },
      pending: false,
    },
    _sum: { amount: true },
  });

  const spendingMap = new Map(
    spendingByCategory.map((s) => [s.category ?? "Uncategorized", Number(s._sum.amount ?? 0)])
  );

  const summary = budgets.map((b) => {
    const spent = spendingMap.get(b.category) ?? 0;
    return {
      ...b,
      spent,
      remaining: Number(b.limitAmount) - spent,
      overspent: spent > Number(b.limitAmount),
    };
  });

  // Total summary
  const totalBudget = budgets.reduce((acc, b) => acc + Number(b.limitAmount), 0);
  const totalSpent = summary.reduce((acc, s) => acc + s.spent, 0);

  return Response.json({
    budgets: summary,
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
  });
});

const createSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  category: z.string().min(1).max(100),
  limitAmount: z.number().positive(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT);

  const body = createSchema.parse(await (req as NextRequest).json());

  const budget = await prisma.budget.upsert({
    where: {
      familyId_year_month_category: {
        familyId: actor.familyId,
        year: body.year,
        month: body.month,
        category: body.category,
      },
    },
    create: {
      familyId: actor.familyId,
      year: body.year,
      month: body.month,
      category: body.category,
      limitAmount: body.limitAmount,
      createdBy: actor.clerkId,
    },
    update: { limitAmount: body.limitAmount },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.BUDGET_UPDATED,
    targetId: budget.id,
    metadata: {
      category: body.category,
      limitAmount: body.limitAmount,
      year: body.year,
      month: body.month,
    },
  });

  return Response.json(budget, { status: 201 });
});

const deleteSchema = z.object({ budgetId: z.string() });

export const DELETE = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT_ADMIN);

  const body = deleteSchema.parse(await (req as NextRequest).json());
  const budget = await prisma.budget.findUnique({ where: { id: body.budgetId } });
  if (!budget || budget.familyId !== actor.familyId) {
    throw new ApiError(404, "Budget not found");
  }

  await prisma.budget.delete({ where: { id: body.budgetId } });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.BUDGET_DELETED,
    targetId: body.budgetId,
    metadata: { category: budget.category },
  });

  return new Response(null, { status: 204 });
});
