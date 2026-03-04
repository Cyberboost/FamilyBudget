/**
 * Canonical list of Plaid personal_finance_category.primary values.
 * Used to populate category dropdowns throughout the UI.
 */
export const PLAID_CATEGORIES = [
  "FOOD_AND_DRINK",
  "TRANSPORTATION",
  "TRAVEL",
  "SHOPPING",
  "ENTERTAINMENT",
  "HEALTH_AND_WELLNESS",
  "PERSONAL_CARE",
  "HOME_IMPROVEMENT",
  "UTILITIES",
  "HOUSING",
  "RENT_AND_UTILITIES",
  "INCOME",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_PAYMENTS",
  "BANK_FEES",
  "GOVERNMENT_AND_NON_PROFIT",
  "EDUCATION",
  "OTHER",
] as const;

export type PlaidCategory = (typeof PLAID_CATEGORIES)[number];

/** Display-friendly label for a raw Plaid category key. */
export function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
