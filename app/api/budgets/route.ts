/**
 * GET  /api/budgets?month=YYYY-MM     – list budget categories with spending totals
 * POST /api/budgets                   – upsert a category limit (PARENT+)
 * DELETE /api/budgets                 – delete a budget category (PARENT_ADMIN)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, requireRole, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";
import { startOfMonth, endOfMonth, format } from "date-fns";

export const GET = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();

  // Kids don't see full budgets; see /api/goals for their view
  if (actor.role === Role.KID) {
    throw new ApiError(403, "Access denied");
  }

  const url = new URL((req as NextRequest).url);
  const now = new Date();
  const monthParam = url.searchParams.get("month") ?? format(now, "yyyy-MM");

  // Validate YYYY-MM format
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    throw new ApiError(400, "month must be in YYYY-MM format");
  }

  const [year, month] = monthParam.split("-").map(Number);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { familyId_month: { familyId: actor.familyId, month: monthParam } },
    include: { categories: { orderBy: { categoryPrimary: "asc" } } },
  });

  const categories = budgetMonth?.categories ?? [];

  // Calculate spending per category for this month
  const spendingByCategory = await prisma.transaction.groupBy({
    by: ["categoryPrimary"],
    where: {
      familyId: actor.familyId,
      date: { gte: monthStart, lte: monthEnd },
      pending: false,
    },
    _sum: { amount: true },
  });

  const spendingMap = new Map(
    spendingByCategory.map((s) => [
      s.categoryPrimary ?? "Uncategorized",
      Number(s._sum.amount ?? 0),
    ])
  );

  const summary = categories.map((c) => {
    const spent = spendingMap.get(c.categoryPrimary) ?? 0;
    return {
      ...c,
      spent,
      remaining: Number(c.limitAmount) - spent,
      overspent: spent > Number(c.limitAmount),
    };
  });

  const totalBudget = categories.reduce((acc, c) => acc + Number(c.limitAmount), 0);
  const totalSpent = summary.reduce((acc, s) => acc + s.spent, 0);

  return Response.json({
    budgetMonthId: budgetMonth?.id ?? null,
    month: monthParam,
    categories: summary,
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
  });
});

const createSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  categoryPrimary: z.string().min(1).max(100),
  limitAmount: z.number().positive(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT);

  const body = createSchema.parse(await (req as NextRequest).json());

  // Get-or-create the BudgetMonth
  const budgetMonth = await prisma.budgetMonth.upsert({
    where: { familyId_month: { familyId: actor.familyId, month: body.month } },
    create: { familyId: actor.familyId, month: body.month, createdBy: actor.clerkId },
    update: {},
  });

  // Upsert the category limit
  const category = await prisma.budgetCategory.upsert({
    where: {
      budgetMonthId_categoryPrimary: {
        budgetMonthId: budgetMonth.id,
        categoryPrimary: body.categoryPrimary,
      },
    },
    create: {
      budgetMonthId: budgetMonth.id,
      categoryPrimary: body.categoryPrimary,
      limitAmount: body.limitAmount,
    },
    update: { limitAmount: body.limitAmount },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.BUDGET_UPDATED,
    entityType: "BudgetCategory",
    targetId: category.id,
    metadata: {
      month: body.month,
      categoryPrimary: body.categoryPrimary,
      limitAmount: body.limitAmount,
    },
  });

  return Response.json({ ...category, month: body.month }, { status: 201 });
});

const deleteSchema = z.object({ categoryId: z.string() });

export const DELETE = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT_ADMIN);

  const body = deleteSchema.parse(await (req as NextRequest).json());
  const category = await prisma.budgetCategory.findUnique({
    where: { id: body.categoryId },
    include: { budgetMonth: true },
  });
  if (!category) {
    throw new ApiError(404, "Budget category not found");
  }
  if (category.budgetMonth.familyId !== actor.familyId) {
    throw new ApiError(404, "Budget category not found");
  }

  await prisma.budgetCategory.delete({ where: { id: body.categoryId } });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.BUDGET_DELETED,
    entityType: "BudgetCategory",
    targetId: body.categoryId,
    metadata: {
      month: category.budgetMonth.month,
      categoryPrimary: category.categoryPrimary,
    },
  });

  return new Response(null, { status: 204 });
});
