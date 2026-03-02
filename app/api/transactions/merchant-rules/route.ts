/**
 * GET    /api/transactions/merchant-rules  – list category rules
 * POST   /api/transactions/merchant-rules  – create category rule
 * DELETE /api/transactions/merchant-rules  – delete category rule
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role, MatchType } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

export const GET = withErrorHandler(async () => {
  const actor = await requireAnyFamilyMember();
  const rules = await prisma.categoryRule.findMany({
    where: { familyId: actor.familyId, isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return Response.json(rules);
});

const createSchema = z.object({
  matchType: z.nativeEnum(MatchType).default(MatchType.CONTAINS),
  matchValue: z.string().min(1).max(200),
  categoryPrimary: z.string().min(1).max(100),
  categoryDetailed: z.string().max(100).optional(),
  priority: z.number().int().min(0).max(1000).default(0),
});

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    throw new ApiError(403, "Requires PARENT role or above");
  }

  const body = createSchema.parse(await (req as NextRequest).json());
  const rule = await prisma.categoryRule.create({
    data: {
      familyId: actor.familyId,
      matchType: body.matchType,
      matchValue: body.matchValue,
      categoryPrimary: body.categoryPrimary,
      categoryDetailed: body.categoryDetailed ?? null,
      priority: body.priority,
      isActive: true,
      createdBy: actor.clerkId,
    },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.CATEGORY_RULE_CREATED,
    entityType: "CategoryRule",
    targetId: rule.id,
    metadata: {
      matchType: body.matchType,
      matchValue: body.matchValue,
      categoryPrimary: body.categoryPrimary,
    },
  });

  return Response.json(rule, { status: 201 });
});

const deleteSchema = z.object({ ruleId: z.string() });

export const DELETE = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    throw new ApiError(403, "Requires PARENT role or above");
  }

  const body = deleteSchema.parse(await (req as NextRequest).json());
  const rule = await prisma.categoryRule.findUnique({ where: { id: body.ruleId } });
  if (!rule || rule.familyId !== actor.familyId) {
    throw new ApiError(404, "Rule not found");
  }

  await prisma.categoryRule.delete({ where: { id: body.ruleId } });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.CATEGORY_RULE_DELETED,
    entityType: "CategoryRule",
    targetId: body.ruleId,
    metadata: { matchValue: rule.matchValue, categoryPrimary: rule.categoryPrimary },
  });

  return new Response(null, { status: 204 });
});
