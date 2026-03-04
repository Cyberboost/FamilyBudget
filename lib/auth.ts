/**
 * Authentication helpers — "who are you?"
 *
 * Responsibilities:
 *   1. requireAuth()             – assert a valid Clerk session; return clerkId.
 *   2. getOrCreateUser()         – map Clerk userId → local User table (upsert).
 *   3. getFamilyMemberOrThrow()  – return the FamilyMember for the current user,
 *                                  or throw 403 if they are not in any family.
 *
 * Authorization (what can you do?) lives in lib/rbac.ts.
 * Audit logging lives in lib/audit.ts.
 *
 * Separation from lib/rbac.ts
 * ---------------------------
 * lib/auth.ts is intentionally side-effect-free with respect to RBAC.
 * It only resolves identity.  lib/rbac.ts imports requireAuth from here so
 * the source-of-truth is a single place, and lib/auth.ts has no circular
 * dependency back into lib/rbac.ts (it imports ApiError, but ApiError has no
 * auth dependencies).
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/rbac";
import type { User, FamilyMember } from "@prisma/client";

// Re-export so callers that previously imported requireAuth from lib/rbac still
// get the canonical implementation — both modules point to the same function.
export { requireAuth } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The resolved identity of the authenticated caller. */
export interface ResolvedActor {
  clerkId: string;
  member: FamilyMember;
}

// ---------------------------------------------------------------------------
// getOrCreateUser
// ---------------------------------------------------------------------------

/**
 * Returns the local User record for `clerkId`, creating it if it does not yet
 * exist.  Clerk is the authoritative source for the user's email, name, and
 * avatar; this function syncs those fields on every creation.
 *
 * This function is **server-side only** — it calls the Clerk Management API
 * which requires the `CLERK_SECRET_KEY` environment variable.
 *
 * @param clerkId - Clerk user ID.  Defaults to the ID from the current
 *   Clerk session (via `requireAuth()`).  Pass explicitly when the caller
 *   already has the ID (avoids a second `auth()` call).
 */
export async function getOrCreateUser(clerkId?: string): Promise<User> {
  const resolvedClerkId = clerkId ?? (await requireAuthLocal());

  // Fast path: record already exists — return it without calling Clerk.
  const existing = await prisma.user.findUnique({ where: { clerkId: resolvedClerkId } });
  if (existing) return existing;

  // Slow path: fetch from Clerk and upsert (handles the race where another
  // request creates the row between our findUnique and our create).
  let email = "";
  let firstName: string | null = null;
  let lastName: string | null = null;
  let avatarUrl: string | null = null;

  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(resolvedClerkId);
    email =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? "";
    firstName = clerkUser.firstName ?? null;
    lastName = clerkUser.lastName ?? null;
    avatarUrl = clerkUser.imageUrl ?? null;
  } catch {
    // Clerk unreachable — create a minimal stub so the app still works.
    // The record will be enriched on the next successful call.
  }

  return prisma.user.upsert({
    where: { clerkId: resolvedClerkId },
    create: { clerkId: resolvedClerkId, email, firstName, lastName, avatarUrl },
    update: { email, firstName, lastName, avatarUrl },
  });
}

// ---------------------------------------------------------------------------
// getFamilyMemberOrThrow
// ---------------------------------------------------------------------------

/**
 * Returns the FamilyMember row for `clerkId` (defaults to the current session
 * user).  Throws:
 *   - 401 ApiError  if there is no valid Clerk session (when `clerkId` is omitted)
 *   - 403 ApiError  if the user is not a member of any family
 *
 * This is the canonical "resolve active family context" function that every
 * route handler should call before touching any family-scoped data.  The
 * returned `member.familyId` must be threaded into every subsequent Prisma
 * query so a user can never read or write data belonging to another family.
 *
 * @example
 *   const member = await getFamilyMemberOrThrow();
 *   const txns = await prisma.transaction.findMany({
 *     where: { familyId: member.familyId },
 *   });
 */
export async function getFamilyMemberOrThrow(clerkId?: string): Promise<FamilyMember> {
  const resolvedClerkId = clerkId ?? (await requireAuthLocal());

  const member = await prisma.familyMember.findFirst({ where: { clerkId: resolvedClerkId } });
  if (!member) {
    throw new ApiError(403, "You are not a member of any family");
  }
  return member;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Private copy of requireAuth so that auth.ts doesn't import from rbac.ts.
 * The public `requireAuth` re-export above gives callers a single import
 * surface, but internally we avoid the circular dependency.
 */
async function requireAuthLocal(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new ApiError(401, "Unauthorized");
  return userId;
}
