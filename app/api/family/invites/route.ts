/**
 * POST /api/family/invites   – invite someone to the family (PARENT or above)
 * GET  /api/family/invites   – list pending invites
 * DELETE /api/family/invites – revoke an invite (PARENT_ADMIN)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole, requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role),
});

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT);

  const body = inviteSchema.parse(await (req as NextRequest).json());

  // Cannot invite PARENT_ADMIN (only the first member gets that role)
  if (body.role === Role.PARENT_ADMIN) {
    throw new ApiError(400, "Cannot invite with PARENT_ADMIN role");
  }

  // Check if they are already a member
  const alreadyMember = await prisma.familyMember.findFirst({
    where: { familyId: actor.familyId, email: body.email },
  });
  if (alreadyMember) {
    throw new ApiError(409, "User is already a member of this family");
  }

  const invite = await prisma.invite.create({
    data: {
      familyId: actor.familyId,
      email: body.email,
      role: body.role,
      invitedBy: actor.clerkId,
      expiresAt: addDays(new Date(), 7),
    },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.MEMBER_INVITED,
    targetId: invite.id,
    metadata: { email: body.email, role: body.role },
  });

  // In production you would send an email here with the invite URL:
  // ${process.env.NEXT_PUBLIC_APP_URL}/invites/accept?token=${invite.token}
  return Response.json(
    {
      invite,
      inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invites/accept?token=${invite.token}`,
    },
    { status: 201 }
  );
});

export const GET = withErrorHandler(async () => {
  const actor = await requireAnyFamilyMember();
  const invites = await prisma.invite.findMany({
    where: { familyId: actor.familyId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  return Response.json(invites);
});

const revokeSchema = z.object({ inviteId: z.string() });

export const DELETE = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  await requireRole(actor.familyId, Role.PARENT_ADMIN);

  const body = revokeSchema.parse(await (req as NextRequest).json());
  const invite = await prisma.invite.findUnique({ where: { id: body.inviteId } });
  if (!invite || invite.familyId !== actor.familyId) {
    throw new ApiError(404, "Invite not found");
  }

  await prisma.invite.update({
    where: { id: body.inviteId },
    data: { status: "REVOKED" },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.INVITE_REVOKED,
    targetId: body.inviteId,
    metadata: { email: invite.email },
  });

  return new Response(null, { status: 204 });
});
