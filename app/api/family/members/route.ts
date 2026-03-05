/**
 * GET  /api/family/members      – list members
 * POST /api/family/members      – update a member's role (PARENT_ADMIN only)
 * DELETE /api/family/members    – remove a member (PARENT_ADMIN only)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

export const GET = withErrorHandler(async () => {
  const member = await requireAnyFamilyMember();
  const members = await prisma.familyMember.findMany({
    where: { familyId: member.familyId },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(members);
});

const updateSchema = z.object({
  memberId: z.string(),
  role: z.nativeEnum(Role),
});

export const PATCH = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT_ADMIN);

  const body = updateSchema.parse(await (req as NextRequest).json());
  const target = await prisma.familyMember.findUnique({
    where: { id: body.memberId },
  });
  if (!target || target.familyId !== actor.familyId) {
    throw new ApiError(404, "Member not found");
  }
  // Cannot demote yourself
  if (target.clerkId === actor.clerkId && body.role !== Role.PARENT_ADMIN) {
    throw new ApiError(400, "Cannot change your own admin role");
  }

  const updated = await prisma.familyMember.update({
    where: { id: body.memberId },
    data: { role: body.role },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.ROLE_CHANGED,
    entityType: "FamilyMember",
    targetId: body.memberId,
    metadata: { newRole: body.role, previousRole: target.role },
  });

  return Response.json(updated);
});

const deleteSchema = z.object({ memberId: z.string() });

export const DELETE = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT_ADMIN);

  const body = deleteSchema.parse(await (req as NextRequest).json());
  if (body.memberId === actor.id) {
    throw new ApiError(400, "Cannot remove yourself");
  }

  const target = await prisma.familyMember.findUnique({
    where: { id: body.memberId },
  });
  if (!target || target.familyId !== actor.familyId) {
    throw new ApiError(404, "Member not found");
  }

  await prisma.familyMember.delete({ where: { id: body.memberId } });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.MEMBER_REMOVED,
    entityType: "FamilyMember",
    targetId: body.memberId,
    metadata: { email: target.email, role: target.role },
  });

  return new Response(null, { status: 204 });
});
