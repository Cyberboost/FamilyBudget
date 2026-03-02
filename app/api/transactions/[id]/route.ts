/**
 * PATCH /api/transactions/[id]
 * Override category for a single transaction. PARENT or above only.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

const bodySchema = z.object({ category: z.string().min(1).max(100) });

export const PATCH = withErrorHandler(
  async (req: Request, ctx: unknown) => {
    const { params } = ctx as { params: Promise<{ id: string }> };
    const { id } = await params;
    const actor = await requireAnyFamilyMember();
    if (actor.role === Role.KID || actor.role === Role.TEEN) {
      throw new ApiError(403, "Requires PARENT role or above");
    }

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.familyId !== actor.familyId) {
      throw new ApiError(404, "Transaction not found");
    }

    const body = bodySchema.parse(await (req as NextRequest).json());
    const updated = await prisma.transaction.update({
      where: { id },
      data: { category: body.category },
    });

    await audit({
      familyId: actor.familyId,
      actorId: actor.clerkId,
      action: AuditAction.CATEGORY_OVERRIDDEN,
      targetId: id,
      metadata: { oldCategory: tx.category, newCategory: body.category },
    });

    return Response.json(updated);
  }
);
