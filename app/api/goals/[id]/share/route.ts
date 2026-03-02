/**
 * PUT /api/goals/[id]/share
 * Update sharing settings for a goal (who can see it). PARENT_ADMIN only.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, requireRole, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

const bodySchema = z.object({
  sharedWith: z.array(z.string()), // array of clerkIds
});

export const PUT = withErrorHandler(async (req: Request, ctx: unknown) => {
  const { params } = ctx as { params: Promise<{ id: string }> };
  const { id } = await params;
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT);

  const goal = await prisma.goal.findUnique({
    where: { id },
    include: { shares: true },
  });
  if (!goal || goal.familyId !== actor.familyId) {
    throw new ApiError(404, "Goal not found");
  }

  const body = bodySchema.parse(await (req as NextRequest).json());

  // Validate all clerkIds belong to the same family
  if (body.sharedWith.length > 0) {
    const members = await prisma.familyMember.findMany({
      where: { familyId: actor.familyId, clerkId: { in: body.sharedWith } },
    });
    if (members.length !== body.sharedWith.length) {
      throw new ApiError(400, "Some users are not members of this family");
    }
  }

  // Replace shares
  await prisma.$transaction([
    prisma.goalShare.deleteMany({ where: { goalId: id } }),
    ...(body.sharedWith.length > 0
      ? [
          prisma.goalShare.createMany({
            data: body.sharedWith.map((clerkId) => ({
              goalId: id,
              clerkId,
            })),
          }),
        ]
      : []),
  ]);

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.GOAL_SHARE_CHANGED,
    entityType: "Goal",
    targetId: id,
    metadata: { sharedWith: body.sharedWith },
  });

  return Response.json({ goalId: id, sharedWith: body.sharedWith });
});
