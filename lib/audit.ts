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
        targetId: params.targetId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[Audit] Failed to write audit log:", err);
  }
}
