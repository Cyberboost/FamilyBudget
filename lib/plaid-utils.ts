/**
 * Utility functions for Plaid data processing.
 *
 * Extracted from route handlers so they can be unit-tested in isolation.
 */
import { prisma } from "@/lib/prisma";
import { MatchType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleMatch {
  categoryPrimary: string;
  categoryDetailed: string | null;
  ruleId: string;
  /** Deterministic rule-based match always has confidence 1.0. */
  confidence: 1.0;
}

// ---------------------------------------------------------------------------
// applyCategoryRules
// ---------------------------------------------------------------------------

/**
 * Evaluates all active CategoryRules for a family against the given merchant
 * name / transaction description string. Rules are evaluated in descending
 * priority order (higher `priority` value wins); ties are broken by creation
 * date (oldest first). Returns the first match, or `null` if nothing matches.
 *
 * Supported match types:
 *   - CONTAINS    – case-insensitive substring match
 *   - STARTS_WITH – case-insensitive prefix match
 *   - REGEX       – case-insensitive regular expression match (malformed
 *                   patterns are silently skipped rather than throwing)
 *
 * @param familyId     - The family whose rules should be evaluated.
 * @param merchantName - The raw merchant name or transaction description to
 *                       match against.
 */
export async function applyCategoryRules(
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
        // Malformed regex — skip this rule silently.
        matched = false;
      }
    }

    if (matched) {
      return {
        categoryPrimary: rule.categoryPrimary,
        categoryDetailed: rule.categoryDetailed,
        ruleId: rule.id,
        confidence: 1.0,
      };
    }
  }

  return null;
}
