/**
 * PATCH  /api/rules/[id] – update a category rule (matchValue, category, priority, isActive).
 * DELETE /api/rules/[id] – permanently delete a category rule.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role, MatchType } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

const patchSchema = z.object({
  matchType: z.nativeEnum(MatchType).optional(),
  matchValue: z.string().min(1).max(200).optional(),
  categoryPrimary: z.string().min(1).max(100).optional(),
  categoryDetailed: z.string().max(100).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: Request, ctx: unknown) => {
  const { params } = ctx as { params: Promise<{ id: string }> };
  const { id } = await params;

  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    throw new ApiError(403, "Requires PARENT role or above");
  }

  const rule = await prisma.categoryRule.findUnique({ where: { id } });
  if (!rule || rule.familyId !== actor.familyId) {
    throw new ApiError(404, "Rule not found");
  }

  const body = patchSchema.parse(await (req as NextRequest).json());
  const updated = await prisma.categoryRule.update({
    where: { id },
    data: {
      ...(body.matchType !== undefined ? { matchType: body.matchType } : {}),
      ...(body.matchValue !== undefined ? { matchValue: body.matchValue } : {}),
      ...(body.categoryPrimary !== undefined ? { categoryPrimary: body.categoryPrimary } : {}),
      ...(body.categoryDetailed !== undefined ? { categoryDetailed: body.categoryDetailed } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });

  return Response.json(updated);
});

export const DELETE = withErrorHandler(async (_req: Request, ctx: unknown) => {
  const { params } = ctx as { params: Promise<{ id: string }> };
  const { id } = await params;

  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    throw new ApiError(403, "Requires PARENT role or above");
  }

  const rule = await prisma.categoryRule.findUnique({ where: { id } });
  if (!rule || rule.familyId !== actor.familyId) {
    throw new ApiError(404, "Rule not found");
  }

  await prisma.categoryRule.delete({ where: { id } });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.CATEGORY_RULE_DELETED,
    entityType: "CategoryRule",
    targetId: id,
    metadata: { matchValue: rule.matchValue, categoryPrimary: rule.categoryPrimary },
  });

  return new Response(null, { status: 204 });
});
