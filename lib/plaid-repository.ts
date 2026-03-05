/**
 * Repository functions for persisting and retrieving Plaid items.
 *
 * All access-token handling is isolated to this module so that the encrypted
 * value never needs to be touched outside of the encryption layer.
 *
 * SERVER-SIDE ONLY — these functions must never be imported by client
 * components or pages that run in the browser.
 *
 * KEY ROTATION NOTES (future work — see lib/encryption.ts for the full plan):
 *   getPlaidAccessToken() decrypts with the current ENCRYPTION_KEY.
 *   During a key rotation event you would temporarily expose a second env var
 *   (e.g. ENCRYPTION_KEY_OLD) and try both keys here before removing the old
 *   one once all rows have been re-encrypted by the migration job.
 */
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { PlaidItemStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedPlaidItem {
  id: string;
  familyId: string;
  plaidItemId: string;
  institutionName: string | null;
  status: PlaidItemStatus;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/**
 * Encrypts `accessTokenPlain` and persists a new PlaidItem row.
 *
 * @param familyId          - Internal DB id of the owning family.
 * @param itemId            - Plaid's item_id returned from /item/public_token/exchange.
 * @param institutionName   - Human-readable institution name (may be null).
 * @param accessTokenPlain  - Raw Plaid access_token.  Encrypted before hitting the DB.
 * @returns The newly created PlaidItem record (without the encrypted token).
 */
export async function savePlaidItemAccessToken(
  familyId: string,
  itemId: string,
  institutionName: string | null,
  accessTokenPlain: string
): Promise<SavedPlaidItem> {
  if (!familyId) throw new Error("savePlaidItemAccessToken: familyId is required");
  if (!itemId) throw new Error("savePlaidItemAccessToken: itemId is required");
  if (!accessTokenPlain) throw new Error("savePlaidItemAccessToken: accessTokenPlain is required");

  const encryptedAccessToken = encrypt(accessTokenPlain);

  const item = await prisma.plaidItem.create({
    data: {
      familyId,
      plaidItemId: itemId,
      encryptedAccessToken,
      institutionName: institutionName ?? null,
    },
    select: {
      id: true,
      familyId: true,
      plaidItemId: true,
      institutionName: true,
      status: true,
      createdAt: true,
    },
  });

  return item;
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

/**
 * Retrieves and decrypts the Plaid access token for a given PlaidItem.
 *
 * @param plaidItemDbId - The internal DB id (not Plaid's item_id) of the PlaidItem row.
 * @returns The decrypted Plaid access_token string.
 * @throws If the item does not exist or decryption fails.
 */
export async function getPlaidAccessToken(plaidItemDbId: string): Promise<string> {
  if (!plaidItemDbId) throw new Error("getPlaidAccessToken: plaidItemDbId is required");

  const item = await prisma.plaidItem.findUnique({
    where: { id: plaidItemDbId },
    select: { encryptedAccessToken: true },
  });

  if (!item) {
    throw new Error(`getPlaidAccessToken: PlaidItem with id "${plaidItemDbId}" not found`);
  }

  return decrypt(item.encryptedAccessToken);
}
