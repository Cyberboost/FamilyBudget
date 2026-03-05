/**
 * PATCH  /api/goals/[id]  – update goal (PARENT+)
 * DELETE /api/goals/[id]  – delete goal (PARENT_ADMIN)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, requireRole, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  targetAmount: z.number().positive().optional(),
  savedAmount: z.number().min(0).optional(),
  targetDate: z.string().datetime().nullable().optional(),
  isCompleted: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: Request, ctx: unknown) => {
  const { params } = ctx as { params: Promise<{ id: string }> };
  const { id } = await params;
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT);

  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal || goal.familyId !== actor.familyId) {
    throw new ApiError(404, "Goal not found");
  }

  const body = updateSchema.parse(await (req as NextRequest).json());
  const updated = await prisma.goal.update({
    where: { id },
    data: {
      ...body,
      targetDate: body.targetDate
        ? new Date(body.targetDate)
        : body.targetDate === null
          ? null
          : undefined,
    },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.GOAL_UPDATED,
    entityType: "Goal",
    targetId: id,
    metadata: body,
  });

  return Response.json(updated);
});

export const DELETE = withErrorHandler(async (_req: Request, ctx: unknown) => {
  const { params } = ctx as { params: Promise<{ id: string }> };
  const { id } = await params;
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT_ADMIN);

  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal || goal.familyId !== actor.familyId) {
    throw new ApiError(404, "Goal not found");
  }

  await prisma.goal.delete({ where: { id } });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.GOAL_DELETED,
    entityType: "Goal",
    targetId: id,
    metadata: { name: goal.name },
  });

  return new Response(null, { status: 204 });
});
