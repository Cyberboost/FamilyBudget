/**
 * Audit logging helper.
 * Records every permission change, bank connection, budget edit, etc.
 */
import { prisma } from "@/lib/prisma";
import { AuditAction, Prisma } from "@prisma/client";

export { AuditAction };

interface AuditParams {
  familyId: string;
  actorId: string;
  action: AuditAction;
  /** Type of the primary entity affected, e.g. "Transaction", "Goal", "Budget". */
  entityType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit log entry. Never throws – log failures are swallowed so
 * they don't break the primary operation.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        familyId: params.familyId,
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[Audit] Failed to write audit log:", err);
  }
}

/**
 * Positional-parameter alias for `audit()`.
 *
 * Matches the signature described in the problem statement:
 *   logAudit(familyId, actorUserId, action, entityType?, entityId?, metadata?)
 *
 * Prefer `audit({ ... })` for new code (named params are less error-prone),
 * but `logAudit` is provided for callers that use the positional style.
 */
export async function logAudit(
  familyId: string,
  actorUserId: string,
  action: AuditAction,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return audit({
    familyId,
    actorId: actorUserId,
    action,
    entityType,
    targetId: entityId,
    metadata,
  });
}
