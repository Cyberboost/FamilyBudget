/**
 * POST /api/invites/accept
 * Accept a family invite using the token from the invite link.
 * This is a public route (no Clerk guard) but requires authentication
 * to know which user is accepting.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError, withErrorHandler } from "@/lib/rbac";
import { audit, AuditAction } from "@/lib/audit";

const bodySchema = z.object({
  token: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const clerkId = await requireAuth();
  const body = bodySchema.parse(await (req as NextRequest).json());

  const invite = await prisma.invite.findUnique({
    where: { token: body.token },
  });

  if (!invite) throw new ApiError(404, "Invite not found");
  if (invite.status !== "PENDING") throw new ApiError(410, "Invite is no longer valid");
  if (invite.expiresAt < new Date()) {
    await prisma.invite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    throw new ApiError(410, "Invite has expired");
  }
  if (invite.email.toLowerCase() !== body.email.toLowerCase()) {
    throw new ApiError(403, "This invite was sent to a different email address");
  }

  // Check not already a member
  const existing = await prisma.familyMember.findUnique({
    where: { familyId_clerkId: { familyId: invite.familyId, clerkId } },
  });
  if (existing) throw new ApiError(409, "Already a member of this family");

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.familyMember.create({
      data: {
        familyId: invite.familyId,
        clerkId,
        email: body.email,
        name: body.name,
        role: invite.role,
      },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED" },
    });
    return m;
  });

  await audit({
    familyId: invite.familyId,
    actorId: clerkId,
    action: AuditAction.INVITE_ACCEPTED,
    targetId: invite.id,
    metadata: { email: body.email, role: invite.role },
  });

  return Response.json(member, { status: 201 });
});
