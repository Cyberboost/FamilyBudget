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
import { Role, MatchType } from "@prisma/client";
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

        const categoryPrimary =
          tx.personal_finance_category?.primary ??
          (tx.category ? tx.category[0] : null) ??
          "Uncategorized";
        const categoryDetailed = tx.personal_finance_category?.detailed ?? null;

        // Apply category rules (returns { category, ruleId } or null)
        const ruleMatch = await applyCategoryRules(actor.familyId, tx.merchant_name ?? tx.name);

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
            categoryPrimary: ruleMatch?.categoryPrimary ?? categoryPrimary,
            categoryDetailed: ruleMatch?.categoryDetailed ?? categoryDetailed,
            ruleAppliedId: ruleMatch?.ruleId ?? null,
            pending: tx.pending,
          },
          update: {
            amount: tx.amount,
            name: tx.name,
            merchantName: tx.merchant_name ?? null,
            categoryPrimary: ruleMatch?.categoryPrimary ?? categoryPrimary,
            categoryDetailed: ruleMatch?.categoryDetailed ?? categoryDetailed,
            ruleAppliedId: ruleMatch?.ruleId ?? null,
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
    entityType: "Transaction",
    metadata: { totalAdded, totalModified, totalRemoved },
  });

  return Response.json({ totalAdded, totalModified, totalRemoved });
});

interface RuleMatch {
  categoryPrimary: string;
  categoryDetailed: string | null;
  ruleId: string;
}

/**
 * Evaluate active CategoryRules (highest priority first) against the given
 * merchant name / description. Returns the first match or null.
 */
async function applyCategoryRules(
  familyId: string,
  merchantName: string
): Promise<RuleMatch | null> {
  const rules = await prisma.categoryRule.findMany({
    where: { familyId, isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  const lower = merchantName.toLowerCase();

  for (const rule of rules) {
    const val = rule.matchValue.toLowerCase();
    let matched = false;

    if (rule.matchType === MatchType.CONTAINS) {
      matched = lower.includes(val);
    } else if (rule.matchType === MatchType.STARTS_WITH) {
      matched = lower.startsWith(val);
    } else if (rule.matchType === MatchType.REGEX) {
      try {
        matched = new RegExp(rule.matchValue, "i").test(merchantName);
      } catch {
        matched = false;
      }
    }

    if (matched) {
      return {
        categoryPrimary: rule.categoryPrimary,
        categoryDetailed: rule.categoryDetailed,
        ruleId: rule.id,
      };
    }
  }

  return null;
}
