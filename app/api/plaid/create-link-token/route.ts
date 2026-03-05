/**
 * POST /api/plaid/create-link-token
 * Creates a Plaid Link token for the frontend.
 * Rate-limited: 10 requests per minute per user.
 */
import { NextRequest } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "@/lib/plaid";
import { requireAnyFamilyMember, ApiError, withErrorHandler } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { rateLimit } from "@/lib/rateLimit";

export const POST = withErrorHandler(async (req: Request) => {
  const actor = await requireAnyFamilyMember();

  if (actor.role === Role.KID || actor.role === Role.TEEN) {
    throw new ApiError(403, "Only parents can connect bank accounts");
  }

  const limited = await rateLimit(req as NextRequest, actor.clerkId, 10, 60_000);
  if (limited) return limited;

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: actor.clerkId },
    client_name: "FamilyBudget",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
  });

  return Response.json({ link_token: response.data.link_token });
});
