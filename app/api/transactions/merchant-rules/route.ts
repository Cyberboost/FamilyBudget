/**
 * GET    /api/transactions/merchant-rules  – list rules
 * POST   /api/transactions/merchant-rules  – create rule
 * DELETE /api/transactions/merchant-rules  – delete rule
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

export const GET = withErrorHandler(async () => {
  const actor = await requireAnyFamilyMember();
  const rules = await prisma.merchantRule.findMany({
    where: { familyId: actor.familyId },
    orderBy: { createdAt: "desc" },
  });
  return Response.json(rules);
});

const createSchema = z.object({
  merchantName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
});

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    throw new ApiError(403, "Requires PARENT role or above");
  }

  const body = createSchema.parse(await (req as NextRequest).json());
  const rule = await prisma.merchantRule.create({
    data: {
      familyId: actor.familyId,
      merchantName: body.merchantName,
      category: body.category,
      createdBy: actor.clerkId,
    },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.MERCHANT_RULE_CREATED,
    targetId: rule.id,
    metadata: { merchantName: body.merchantName, category: body.category },
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
  const rule = await prisma.merchantRule.findUnique({ where: { id: body.ruleId } });
  if (!rule || rule.familyId !== actor.familyId) {
    throw new ApiError(404, "Rule not found");
  }

  await prisma.merchantRule.delete({ where: { id: body.ruleId } });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.MERCHANT_RULE_DELETED,
    targetId: body.ruleId,
    metadata: { merchantName: rule.merchantName },
  });

  return new Response(null, { status: 204 });
});
