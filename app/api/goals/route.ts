/**
 * GET  /api/goals  – list goals (kids see only shared goals)
 * POST /api/goals  – create goal (PARENT+)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, requireRole, withErrorHandler } from "@/lib/rbac";
import { Role, GoalType, GoalVisibility } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

export const GET = withErrorHandler(async () => {
  const actor = await requireAnyFamilyMember();

  let goals;
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    // Kids/teens see only goals explicitly shared with them
    goals = await prisma.goal.findMany({
      where: {
        familyId: actor.familyId,
        shares: { some: { clerkId: actor.clerkId } },
      },
      include: {
        shares: { select: { clerkId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  } else {
    goals = await prisma.goal.findMany({
      where: { familyId: actor.familyId },
      include: { shares: { select: { clerkId: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  return Response.json(goals);
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(GoalType).default(GoalType.SAVINGS),
  visibility: z.nativeEnum(GoalVisibility).default(GoalVisibility.FAMILY),
  targetAmount: z.number().positive(),
  savedAmount: z.number().min(0).optional().default(0),
  targetDate: z.string().datetime().optional(),
  sharedWith: z.array(z.string()).optional().default([]), // array of clerkIds
});

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT);

  const body = createSchema.parse(await (req as NextRequest).json());

  const goal = await prisma.$transaction(async (tx) => {
    const g = await tx.goal.create({
      data: {
        familyId: actor.familyId,
        name: body.name,
        description: body.description,
        type: body.type,
        visibility: body.visibility,
        targetAmount: body.targetAmount,
        savedAmount: body.savedAmount,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        createdBy: actor.clerkId,
      },
    });

    if (body.sharedWith.length > 0) {
      await tx.goalShare.createMany({
        data: body.sharedWith.map((clerkId) => ({ goalId: g.id, clerkId })),
        skipDuplicates: true,
      });
    }

    return g;
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.GOAL_CREATED,
    entityType: "Goal",
    targetId: goal.id,
    metadata: { name: body.name, targetAmount: body.targetAmount, sharedWith: body.sharedWith },
  });

  return Response.json(goal, { status: 201 });
});
