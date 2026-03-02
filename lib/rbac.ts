/**
 * RBAC utilities.
 * Roles (from highest to lowest privilege):
 *   PARENT_ADMIN > PARENT > TEEN > KID
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Role, type Family, type FamilyMember } from "@prisma/client";

export type { Role };

/** Hierarchy: higher index = higher privilege */
const ROLE_ORDER: Role[] = [Role.KID, Role.TEEN, Role.PARENT, Role.PARENT_ADMIN];

export function roleRank(role: Role): number {
  return ROLE_ORDER.indexOf(role);
}

export function isAtLeast(userRole: Role, minRole: Role): boolean {
  return roleRank(userRole) >= roleRank(minRole);
}

export function isParent(role: Role): boolean {
  return isAtLeast(role, Role.PARENT);
}

export function isParentAdmin(role: Role): boolean {
  return role === Role.PARENT_ADMIN;
}

// ------------------------------------------------------------------
// Server-side auth helpers
// ------------------------------------------------------------------

/**
 * Returns the Clerk userId or throws a 401-style error.
 */
export async function requireAuth(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }
  return userId;
}

/**
 * Returns the FamilyMember record for the authenticated user in the given
 * family, or throws if the user is not a member.
 */
export async function requireFamilyMember(familyId: string): Promise<FamilyMember> {
  const clerkId = await requireAuth();
  const member = await prisma.familyMember.findUnique({
    where: { familyId_clerkId: { familyId, clerkId } },
  });
  if (!member) {
    throw new ApiError(403, "Not a member of this family");
  }
  return member;
}

/**
 * Returns the FamilyMember record for the authenticated user in the given
 * family, and asserts that their role is at least `minRole`.
 *
 * Alias-friendly name that mirrors the problem-statement contract.
 */
export async function requireFamilyRole(familyId: string, minRole: Role): Promise<FamilyMember> {
  return requireRole(familyId, minRole);
}

/**
 * Returns the FamilyMember record for the authenticated user in the given
 * family, and asserts that their role is at least `minRole`.
 */
export async function requireRole(familyId: string, minRole: Role): Promise<FamilyMember> {
  const member = await requireFamilyMember(familyId);
  if (!isAtLeast(member.role, minRole)) {
    throw new ApiError(403, `Requires role ${minRole} or higher (current: ${member.role})`);
  }
  return member;
}

/**
 * Looks up which family the current user belongs to and returns the member
 * record. Throws if the user is not in any family.
 */
export async function requireAnyFamilyMember(): Promise<FamilyMember> {
  const clerkId = await requireAuth();
  const member = await prisma.familyMember.findFirst({
    where: { clerkId },
  });
  if (!member) {
    throw new ApiError(403, "You are not a member of any family");
  }
  return member;
}

/**
 * Returns the Family record for the authenticated user.
 * Throws 401 if not logged in, 403 if the user is not yet in a family.
 *
 * Useful in Server Components and API routes that need the full Family object:
 *
 *   const family = await getActiveFamily();
 */
export async function getActiveFamily(): Promise<Family> {
  const member = await requireAnyFamilyMember();
  const family = await prisma.family.findUnique({
    where: { id: member.familyId },
  });
  if (!family) {
    // Should never happen due to FK constraints, but guard anyway.
    throw new ApiError(500, "Family record not found");
  }
  return family;
}

// ------------------------------------------------------------------
// Typed API error (for consistent error responses)
// ------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Wrap a route handler so ApiErrors are returned as JSON and unexpected
 * errors are returned as 500.
 */
export function withErrorHandler(handler: (req: Request, ctx?: unknown) => Promise<Response>) {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error("[API Error]", err);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
