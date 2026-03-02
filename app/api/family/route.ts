/**
 * POST /api/family
 * Create a new family workspace. The authenticated user becomes PARENT_ADMIN.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError, withErrorHandler } from "@/lib/rbac";
import { audit, AuditAction } from "@/lib/audit";

const bodySchema = z.object({
  name: z.string().min(1).max(100),
});

export const POST = withErrorHandler(async (req: Request) => {
  const clerkId = await requireAuth();

  // A user can only be in one family (enforce MVP simplicity)
  const existing = await prisma.familyMember.findFirst({ where: { clerkId } });
  if (existing) {
    throw new ApiError(409, "You are already a member of a family");
  }

  const body = bodySchema.parse(await (req as NextRequest).json());

  // Fetch email from Clerk
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkId);
  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    "";

  const family = await prisma.$transaction(async (tx) => {
    const f = await tx.family.create({ data: { name: body.name } });
    await tx.familyMember.create({
      data: {
        familyId: f.id,
        clerkId,
        email,
        name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || null,
        role: "PARENT_ADMIN",
      },
    });
    return f;
  });

  await audit({
    familyId: family.id,
    actorId: clerkId,
    action: AuditAction.FAMILY_CREATED,
    entityType: "Family",
    targetId: family.id,
    metadata: { name: body.name },
  });

  return Response.json(family, { status: 201 });
});

/**
 * GET /api/family
 * Return the family the current user belongs to.
 */
export const GET = withErrorHandler(async () => {
  const clerkId = await requireAuth();
  const member = await prisma.familyMember.findFirst({
    where: { clerkId },
    include: { family: true },
  });
  if (!member) {
    throw new ApiError(404, "Not a member of any family");
  }
  return Response.json(member.family);
});
