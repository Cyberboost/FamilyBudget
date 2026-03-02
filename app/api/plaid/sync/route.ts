/**
 * POST /api/plaid/sync
 * Sync transactions for all Plaid items belonging to the family.
 * Uses the /transactions/sync endpoint with a cursor for incremental updates.
 * Rate-limited: 3 requests per minute per family.
 */
import { NextRequest } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID) {
    throw new ApiError(403, "Insufficient permissions");
  }

  const limited = await rateLimit(req as NextRequest, `sync:${actor.familyId}`, 3, 60_000);
  if (limited) return limited;

  const items = await prisma.plaidItem.findMany({
    where: { familyId: actor.familyId },
    include: { accounts: true },
  });

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  for (const item of items) {
    const accessToken = decrypt(item.encryptedAccessToken);
    let cursor = item.cursor ?? undefined;
    let hasMore = true;

    while (hasMore) {
      const resp = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
      });

      const { added, modified, removed, next_cursor, has_more } = resp.data;

      // Map plaidAccountId → internal DB account id
      const accountMap = new Map<string, string>(
        item.accounts.map((a) => [a.plaidAccountId, a.id])
      );

      // Upsert added/modified transactions
      for (const tx of [...added, ...modified]) {
        const accountId = accountMap.get(tx.account_id);
        if (!accountId) continue;

        const category =
          tx.personal_finance_category?.primary ??
          (tx.category ? tx.category[0] : null) ??
          "Uncategorized";

        // Apply merchant rules
        const overrideCategory = await applyMerchantRules(
          actor.familyId,
          tx.merchant_name ?? tx.name
        );

        await prisma.transaction.upsert({
          where: { plaidTransactionId: tx.transaction_id },
          create: {
            familyId: actor.familyId,
            accountId,
            plaidTransactionId: tx.transaction_id,
            amount: tx.amount,
            isoCurrencyCode: tx.iso_currency_code ?? null,
            date: new Date(tx.date),
            name: tx.name,
            merchantName: tx.merchant_name ?? null,
            category: overrideCategory ?? category,
            plaidCategory: category,
            pending: tx.pending,
          },
          update: {
            amount: tx.amount,
            name: tx.name,
            merchantName: tx.merchant_name ?? null,
            category: overrideCategory ?? category,
            plaidCategory: category,
            pending: tx.pending,
          },
        });
      }

      // Remove deleted transactions
      for (const tx of removed) {
        await prisma.transaction.deleteMany({
          where: {
            plaidTransactionId: tx.transaction_id,
            familyId: actor.familyId,
          },
        });
      }

      totalAdded += added.length;
      totalModified += modified.length;
      totalRemoved += removed.length;

      cursor = next_cursor;
      hasMore = has_more;
    }

    // Update cursor and lastSyncedAt
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { cursor, lastSyncedAt: new Date() },
    });
  }

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.TRANSACTION_SYNCED,
    metadata: { totalAdded, totalModified, totalRemoved },
  });

  return Response.json({ totalAdded, totalModified, totalRemoved });
});

/**
 * Check merchant rules and return the matching category if any.
 */
async function applyMerchantRules(
  familyId: string,
  merchantName: string
): Promise<string | null> {
  const rules = await prisma.merchantRule.findMany({
    where: { familyId },
  });
  const lower = merchantName.toLowerCase();
  for (const rule of rules) {
    if (lower.includes(rule.merchantName.toLowerCase())) {
      return rule.category;
    }
  }
  return null;
}
