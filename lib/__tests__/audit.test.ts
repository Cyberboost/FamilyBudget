/**
 * Unit tests for lib/audit.ts — specifically the logAudit() positional alias.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { logAudit, audit, AuditAction } from "../audit";

const FAMILY_ID = "family_test";
const ACTOR_ID = "user_actor";

describe("logAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes an audit log row with all provided fields", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await logAudit(FAMILY_ID, ACTOR_ID, AuditAction.MEMBER_INVITED, "Invite", "invite_1", {
      email: "bob@example.com",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        familyId: FAMILY_ID,
        actorId: ACTOR_ID,
        action: AuditAction.MEMBER_INVITED,
        entityType: "Invite",
        targetId: "invite_1",
        metadata: { email: "bob@example.com" },
      },
    });
  });

  it("works with only the required positional arguments", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await logAudit(FAMILY_ID, ACTOR_ID, AuditAction.FAMILY_CREATED);

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        familyId: FAMILY_ID,
        actorId: ACTOR_ID,
        action: AuditAction.FAMILY_CREATED,
        entityType: null,
        targetId: null,
        metadata: undefined,
      },
    });
  });

  it("swallows DB errors and does not throw", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB unavailable")
    );

    // Must not throw — audit log failures are non-fatal
    await expect(
      logAudit(FAMILY_ID, ACTOR_ID, AuditAction.FAMILY_CREATED)
    ).resolves.toBeUndefined();
  });

  it("produces the same result as calling audit() with named params", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const entityType = "Goal";
    const targetId = "goal_42";
    const metadata = { change: "name" };

    // Call both wrappers
    await logAudit(FAMILY_ID, ACTOR_ID, AuditAction.GOAL_UPDATED, entityType, targetId, metadata);
    await audit({
      familyId: FAMILY_ID,
      actorId: ACTOR_ID,
      action: AuditAction.GOAL_UPDATED,
      entityType,
      targetId,
      metadata,
    });

    // Both should call prisma.auditLog.create with identical data
    const calls = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
  });
});
