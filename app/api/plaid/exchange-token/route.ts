/**
 * POST /api/plaid/exchange-token
 * Exchanges a Plaid public_token for an access_token,
 * stores the encrypted access token, and immediately syncs accounts.
 * Rate-limited: 5 requests per minute per user.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { audit, AuditAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({
  public_token: z.string(),
  institution_id: z.string().optional(),
  institution_name: z.string().optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();
  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    throw new ApiError(403, "Only parents can connect bank accounts");
  }

  const limited = await rateLimit(req as NextRequest, actor.clerkId, 5, 60_000);
  if (limited) return limited;

  const body = bodySchema.parse(await (req as NextRequest).json());

  // Exchange public token
  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: body.public_token,
  });
  const { access_token, item_id } = exchangeResponse.data;

  // Encrypt the access token before storing
  const encryptedAccessToken = encrypt(access_token);

  const plaidItem = await prisma.plaidItem.create({
    data: {
      familyId: actor.familyId,
      plaidItemId: item_id,
      encryptedAccessToken,
      institutionId: body.institution_id,
      institutionName: body.institution_name,
    },
  });

  await audit({
    familyId: actor.familyId,
    actorId: actor.clerkId,
    action: AuditAction.BANK_CONNECTED,
    targetId: plaidItem.id,
    metadata: { institutionName: body.institution_name, itemId: item_id },
  });

  // Sync accounts immediately (fire-and-forget; full sync happens via /api/plaid/sync)
  try {
    await syncAccounts(access_token, plaidItem.id, actor.familyId);
  } catch (err) {
    console.error("[Plaid] Initial account sync failed:", err);
  }

  return Response.json(
    { plaidItemId: plaidItem.id, institutionName: body.institution_name },
    { status: 201 }
  );
});

/**
 * Fetch accounts from Plaid and upsert into DB.
 */
async function syncAccounts(
  accessToken: string,
  plaidItemDbId: string,
  familyId: string
) {
  const resp = await plaidClient.accountsGet({ access_token: accessToken });
  for (const acct of resp.data.accounts) {
    await prisma.account.upsert({
      where: { plaidAccountId: acct.account_id },
      create: {
        familyId,
        plaidItemId: plaidItemDbId,
        plaidAccountId: acct.account_id,
        name: acct.name,
        officialName: acct.official_name ?? null,
        type: acct.type,
        subtype: acct.subtype ?? null,
        mask: acct.mask ?? null,
        currentBalance: acct.balances.current ?? null,
        availableBalance: acct.balances.available ?? null,
        isoCurrencyCode: acct.balances.iso_currency_code ?? null,
      },
      update: {
        currentBalance: acct.balances.current ?? null,
        availableBalance: acct.balances.available ?? null,
      },
    });
  }
}
