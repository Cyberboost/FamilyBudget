/**
 * Unit tests for lib/auth.ts
 *
 * Clerk and Prisma are fully mocked so no network or database access is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE any imports that trigger the mocked modules
// ---------------------------------------------------------------------------

// Mock @clerk/nextjs/server
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock @/lib/prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    familyMember: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock @/lib/rbac — only ApiError is needed; requireAuth is re-exported from rbac
// so we mock it here to control what requireAuth returns.
vi.mock("@/lib/rbac", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  }
  return {
    ApiError,
    // requireAuth is imported by lib/auth.ts as a re-export; we mock it so
    // tests can control the clerkId without hitting real Clerk.
    requireAuth: vi.fn(),
  };
});

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireAuth as mockRequireAuth } from "@/lib/rbac";

// We import the module under test AFTER mocks are set up.
import { getOrCreateUser, getFamilyMemberOrThrow } from "../auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLERK_ID = "user_abc123";

const MOCK_CLERK_USER = {
  id: CLERK_ID,
  primaryEmailAddressId: "email_1",
  emailAddresses: [{ id: "email_1", emailAddress: "alice@example.com" }],
  firstName: "Alice",
  lastName: "Smith",
  imageUrl: "https://example.com/avatar.png",
};

const MOCK_USER_RECORD = {
  id: "local_user_1",
  clerkId: CLERK_ID,
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Smith",
  avatarUrl: "https://example.com/avatar.png",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_FAMILY_MEMBER = {
  id: "member_1",
  familyId: "family_1",
  clerkId: CLERK_ID,
  email: "alice@example.com",
  name: "Alice Smith",
  role: "PARENT_ADMIN" as const,
  permissionsJson: null,
  status: "ACTIVE" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockClerkClient() {
  vi.mocked(clerkClient).mockResolvedValue({
    users: { getUser: vi.fn().mockResolvedValue(MOCK_CLERK_USER) },
  } as never);
}

// ---------------------------------------------------------------------------
// getOrCreateUser
// ---------------------------------------------------------------------------

describe("getOrCreateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, requireAuth (from rbac) resolves to the test clerkId
    (mockRequireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(CLERK_ID);
    // By default, auth() also resolves (used by requireAuthLocal inside auth.ts)
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: CLERK_ID });
  });

  it("returns the existing User record without calling Clerk when one exists", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER_RECORD);

    const user = await getOrCreateUser(CLERK_ID);

    expect(user).toEqual(MOCK_USER_RECORD);
    expect(clerkClient).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("creates a new User record when one does not exist", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    mockClerkClient();
    (prisma.user.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER_RECORD);

    const user = await getOrCreateUser(CLERK_ID);

    expect(clerkClient).toHaveBeenCalled();
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { clerkId: CLERK_ID },
      create: {
        clerkId: CLERK_ID,
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
        avatarUrl: "https://example.com/avatar.png",
      },
      update: {
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
        avatarUrl: "https://example.com/avatar.png",
      },
    });
    expect(user).toEqual(MOCK_USER_RECORD);
  });

  it("falls back to empty strings when Clerk is unreachable and still upserts", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    vi.mocked(clerkClient).mockRejectedValue(new Error("Clerk unreachable"));
    (prisma.user.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_USER_RECORD,
      email: "",
    });

    await expect(getOrCreateUser(CLERK_ID)).resolves.toBeDefined();
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: "" }),
      })
    );
  });

  it("uses the session clerkId when called without arguments", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER_RECORD);

    // auth() is called by requireAuthLocal when no clerkId arg is provided
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: CLERK_ID });

    const user = await getOrCreateUser(); // no clerkId arg

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { clerkId: CLERK_ID } });
    expect(user).toEqual(MOCK_USER_RECORD);
  });

  it("throws 401 when called without arguments and there is no session", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: null });

    await expect(getOrCreateUser()).rejects.toMatchObject({ status: 401 });
  });
});

// ---------------------------------------------------------------------------
// getFamilyMemberOrThrow
// ---------------------------------------------------------------------------

describe("getFamilyMemberOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: CLERK_ID });
  });

  it("returns the FamilyMember when found", async () => {
    (prisma.familyMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      MOCK_FAMILY_MEMBER
    );

    const member = await getFamilyMemberOrThrow(CLERK_ID);

    expect(member).toEqual(MOCK_FAMILY_MEMBER);
    expect(prisma.familyMember.findFirst).toHaveBeenCalledWith({
      where: { clerkId: CLERK_ID },
    });
  });

  it("throws 403 when the user is not a member of any family", async () => {
    (prisma.familyMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(getFamilyMemberOrThrow(CLERK_ID)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("not a member"),
    });
  });

  it("uses the session clerkId when called without arguments", async () => {
    (prisma.familyMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      MOCK_FAMILY_MEMBER
    );

    const member = await getFamilyMemberOrThrow();

    expect(prisma.familyMember.findFirst).toHaveBeenCalledWith({ where: { clerkId: CLERK_ID } });
    expect(member.familyId).toBe("family_1");
  });

  it("throws 401 when called without arguments and there is no session", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: null });

    await expect(getFamilyMemberOrThrow()).rejects.toMatchObject({ status: 401 });
  });
});
