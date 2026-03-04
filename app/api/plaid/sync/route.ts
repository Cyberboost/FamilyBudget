/**
 * POST /api/plaid/sync
 * Sync transactions for all Plaid items belonging to the family.
 * Uses the /transactions/sync endpoint with a cursor for incremental updates.
 * Rate-limited: 3 requests per minute per family.
 */
import { NextRequest } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { getPlaidAccessToken } from "@/lib/plaid-repository";
import { applyCategoryRules } from "@/lib/plaid-utils";
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
    const accessToken = await getPlaidAccessToken(item.id);
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

      const changedTxs = [...added, ...modified];

      // Batch-fetch existing transactions that have a user category override so
      // we can skip overwriting them.  One query per page instead of N queries.
      const changedIds = changedTxs.map((tx) => tx.transaction_id);
      const existingWithOverride = await prisma.transaction.findMany({
        where: {
          plaidTransactionId: { in: changedIds },
          userCategoryOverride: { not: null },
        },
        select: { plaidTransactionId: true },
      });
      const overrideSet = new Set(existingWithOverride.map((r) => r.plaidTransactionId));

      // Upsert added/modified transactions
      for (const tx of changedTxs) {
        const accountId = accountMap.get(tx.account_id);
        if (!accountId) continue;

        const categoryPrimary =
          tx.personal_finance_category?.primary ??
          (tx.category ? tx.category[0] : null) ??
          "Uncategorized";
        const categoryDetailed = tx.personal_finance_category?.detailed ?? null;

        // Apply category rules deterministically (confidence=1.0 when matched)
        const ruleMatch = await applyCategoryRules(actor.familyId, tx.merchant_name ?? tx.name);

        // Category fields to apply on create (always) and on update (only when
        // no user override is set).
        const categoryFields = {
          categoryPrimary: ruleMatch?.categoryPrimary ?? categoryPrimary,
          categoryDetailed: ruleMatch?.categoryDetailed ?? categoryDetailed,
          ruleAppliedId: ruleMatch?.ruleId ?? null,
          confidence: ruleMatch ? 1.0 : null,
        };

        // Check if the existing transaction already has a user-supplied category
        // override.  If so, skip updating category/rule fields to preserve it.
        const hasOverride = overrideSet.has(tx.transaction_id);

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
            pending: tx.pending,
            ...categoryFields,
          },
          update: {
            amount: tx.amount,
            name: tx.name,
            merchantName: tx.merchant_name ?? null,
            pending: tx.pending,
            // Only apply new category data when the user hasn't made an explicit override
            ...(hasOverride ? {} : categoryFields),
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
    action: AuditAction.PLAID_SYNC_RUN,
    entityType: "Transaction",
    metadata: { totalAdded, totalModified, totalRemoved },
  });

  return Response.json({ totalAdded, totalModified, totalRemoved });
});
