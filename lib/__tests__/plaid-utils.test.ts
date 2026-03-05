/**
 * Unit tests for lib/plaid-utils.ts — applyCategoryRules
 *
 * Prisma is fully mocked; no database access is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchType } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    categoryRule: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { applyCategoryRules } from "../plaid-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: {
  id?: string;
  matchType?: MatchType;
  matchValue?: string;
  categoryPrimary?: string;
  categoryDetailed?: string | null;
  priority?: number;
  isActive?: boolean;
}) {
  return {
    id: overrides.id ?? "rule_1",
    familyId: "family_1",
    matchType: overrides.matchType ?? MatchType.CONTAINS,
    matchValue: overrides.matchValue ?? "starbucks",
    categoryPrimary: overrides.categoryPrimary ?? "FOOD_AND_DRINK",
    // Use explicit `in` check so callers can pass null intentionally
    categoryDetailed: "categoryDetailed" in overrides ? (overrides.categoryDetailed ?? null) : "COFFEE_SHOP",
    priority: overrides.priority ?? 0,
    isActive: overrides.isActive ?? true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    createdBy: "user_1",
  };
}

// ---------------------------------------------------------------------------
// CONTAINS match type
// ---------------------------------------------------------------------------

describe("applyCategoryRules — CONTAINS", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches when merchantName contains the matchValue (case-insensitive)", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([makeRule({ matchValue: "starbucks" })]);

    const result = await applyCategoryRules("family_1", "STARBUCKS #1234");

    expect(result).toMatchObject({
      categoryPrimary: "FOOD_AND_DRINK",
      categoryDetailed: "COFFEE_SHOP",
      confidence: 1.0,
    });
    expect(result?.ruleId).toBe("rule_1");
  });

  it("returns null when there is no match", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([makeRule({ matchValue: "starbucks" })]);

    const result = await applyCategoryRules("family_1", "Amazon Prime");

    expect(result).toBeNull();
  });

  it("returns null when no rules exist", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([]);

    const result = await applyCategoryRules("family_1", "STARBUCKS #1234");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// STARTS_WITH match type
// ---------------------------------------------------------------------------

describe("applyCategoryRules — STARTS_WITH", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches when merchantName starts with matchValue (case-insensitive)", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({ matchType: MatchType.STARTS_WITH, matchValue: "walmart" }),
    ]);

    const result = await applyCategoryRules("family_1", "Walmart Supercenter");

    expect(result).not.toBeNull();
    expect(result?.confidence).toBe(1.0);
  });

  it("does not match when matchValue appears in the middle", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({ matchType: MatchType.STARTS_WITH, matchValue: "walmart" }),
    ]);

    const result = await applyCategoryRules("family_1", "The Walmart Store");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// REGEX match type
// ---------------------------------------------------------------------------

describe("applyCategoryRules — REGEX", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches using a valid regular expression (case-insensitive)", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({ matchType: MatchType.REGEX, matchValue: "^amazon\\s*(prime)?$" }),
    ]);

    const result = await applyCategoryRules("family_1", "Amazon Prime");

    expect(result).not.toBeNull();
    expect(result?.confidence).toBe(1.0);
  });

  it("skips a malformed regex without throwing", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({ matchType: MatchType.REGEX, matchValue: "[invalid(" }),
    ]);

    // Should not throw — malformed pattern should be silently ignored
    const result = await applyCategoryRules("family_1", "Amazon Prime");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

describe("applyCategoryRules — priority ordering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the highest-priority matching rule when multiple rules match", async () => {
    // Prisma already returns rules ordered by priority desc in the real impl;
    // here we mock that ordering directly.
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({
        id: "rule_high",
        matchValue: "amazon",
        categoryPrimary: "SHOPPING",
        priority: 10,
      }),
      makeRule({
        id: "rule_low",
        matchValue: "amazon",
        categoryPrimary: "OTHER",
        priority: 1,
      }),
    ]);

    const result = await applyCategoryRules("family_1", "Amazon.com");

    expect(result?.ruleId).toBe("rule_high");
    expect(result?.categoryPrimary).toBe("SHOPPING");
  });

  it("falls through to next rule when high-priority rule does not match", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({
        id: "rule_high",
        matchValue: "starbucks",
        categoryPrimary: "COFFEE",
        priority: 10,
      }),
      makeRule({
        id: "rule_low",
        matchValue: "amazon",
        categoryPrimary: "SHOPPING",
        priority: 1,
      }),
    ]);

    const result = await applyCategoryRules("family_1", "Amazon.com");

    expect(result?.ruleId).toBe("rule_low");
    expect(result?.categoryPrimary).toBe("SHOPPING");
  });
});

// ---------------------------------------------------------------------------
// confidence is always 1.0 on a match
// ---------------------------------------------------------------------------

describe("applyCategoryRules — confidence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always returns confidence 1.0 for a deterministic rule match", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({ matchValue: "target" }),
    ]);

    const result = await applyCategoryRules("family_1", "Target Store #456");

    expect(result?.confidence).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// categoryDetailed may be null
// ---------------------------------------------------------------------------

describe("applyCategoryRules — categoryDetailed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null categoryDetailed when the rule has none", async () => {
    vi.mocked(prisma.categoryRule.findMany).mockResolvedValue([
      makeRule({ matchValue: "costco", categoryDetailed: null }),
    ]);

    const result = await applyCategoryRules("family_1", "Costco Wholesale");

    expect(result?.categoryDetailed).toBeNull();
  });
});
