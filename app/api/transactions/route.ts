/**
 * GET /api/transactions
 * List transactions for the family with pagination, search, and filters.
 * Kids see only what's explicitly shared (empty list unless parents share via Goals).
 *
 * Query params:
 *   page, pageSize, search, category, accountId, startDate, endDate
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";

export const GET = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();

  // Kids do not see raw transactions
  if (actor.role === Role.KID) {
    throw new ApiError(403, "Kids do not have access to transaction history");
  }

  const url = new URL((req as NextRequest).url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, parseInt(url.searchParams.get("pageSize") ?? "50"));
  const search = url.searchParams.get("search") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const startDate = url.searchParams.get("startDate") ?? undefined;
  const endDate = url.searchParams.get("endDate") ?? undefined;

  // Teens can only see their own linked accounts (TODO: implement allowance accounts)
  // For MVP, teens see all family transactions
  const where: Record<string, unknown> = { familyId: actor.familyId };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { merchantName: { contains: search, mode: "insensitive" } },
    ];
  }
  if (category) {
    // Match against userCategoryOverride first, then categoryPrimary
    where.OR = [{ userCategoryOverride: category }, { categoryPrimary: category }];
  }
  if (accountId) where.accountId = accountId;
  if (startDate || endDate) {
    where.date = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
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
