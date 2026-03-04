/**
 * Unit tests for lib/budget-utils.ts
 *
 * All tests are pure: no database, no Prisma, no network.
 */
import { describe, it, expect } from "vitest";
import {
  buildSpendingMap,
  computeBudgetLines,
  computeDashboardSummary,
  type SpendingRow,
  type BudgetCatRow,
} from "../budget-utils";

// ---------------------------------------------------------------------------
// buildSpendingMap
// ---------------------------------------------------------------------------

describe("buildSpendingMap", () => {
  it("returns an empty map for empty input", () => {
    expect(buildSpendingMap([])).toEqual(new Map());
  });

  it("maps a single row correctly", () => {
    const rows: SpendingRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", amount: 42.5 }];
    const map = buildSpendingMap(rows);
    expect(map.get("FOOD_AND_DRINK")).toBe(42.5);
  });

  it("maps null categoryPrimary to 'Uncategorized'", () => {
    const rows: SpendingRow[] = [{ categoryPrimary: null, amount: 20 }];
    const map = buildSpendingMap(rows);
    expect(map.get("Uncategorized")).toBe(20);
  });

  it("sums duplicate categories", () => {
    const rows: SpendingRow[] = [
      { categoryPrimary: "SHOPPING", amount: 100 },
      { categoryPrimary: "SHOPPING", amount: 50 },
    ];
    const map = buildSpendingMap(rows);
    expect(map.get("SHOPPING")).toBe(150);
  });

  it("handles multiple distinct categories", () => {
    const rows: SpendingRow[] = [
      { categoryPrimary: "FOOD_AND_DRINK", amount: 200 },
      { categoryPrimary: "TRANSPORTATION", amount: 80 },
      { categoryPrimary: null, amount: 15 },
    ];
    const map = buildSpendingMap(rows);
    expect(map.size).toBe(3);
    expect(map.get("FOOD_AND_DRINK")).toBe(200);
    expect(map.get("TRANSPORTATION")).toBe(80);
    expect(map.get("Uncategorized")).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// computeBudgetLines
// ---------------------------------------------------------------------------

describe("computeBudgetLines", () => {
  it("returns empty array when no budget categories", () => {
    const spendingMap = buildSpendingMap([{ categoryPrimary: "FOOD_AND_DRINK", amount: 100 }]);
    expect(computeBudgetLines([], spendingMap)).toEqual([]);
  });

  it("returns 0 spent when no transactions for the category", () => {
    const cats: BudgetCatRow[] = [{ categoryPrimary: "SHOPPING", limitAmount: 200 }];
    const [line] = computeBudgetLines(cats, new Map());
    expect(line.spent).toBe(0);
    expect(line.limit).toBe(200);
    expect(line.remaining).toBe(200);
    expect(line.overspent).toBe(false);
    expect(line.pct).toBe(0);
  });

  it("marks a category as overspent when spent > limit", () => {
    const cats: BudgetCatRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", limitAmount: 100 }];
    const spendingMap = buildSpendingMap([{ categoryPrimary: "FOOD_AND_DRINK", amount: 150 }]);
    const [line] = computeBudgetLines(cats, spendingMap);
    expect(line.overspent).toBe(true);
    expect(line.remaining).toBe(-50);
    expect(line.pct).toBeCloseTo(150, 1);
  });

  it("marks a category as NOT overspent when spent === limit", () => {
    const cats: BudgetCatRow[] = [{ categoryPrimary: "ENTERTAINMENT", limitAmount: 100 }];
    const spendingMap = buildSpendingMap([{ categoryPrimary: "ENTERTAINMENT", amount: 100 }]);
    const [line] = computeBudgetLines(cats, spendingMap);
    expect(line.overspent).toBe(false);
    expect(line.remaining).toBe(0);
    expect(line.pct).toBeCloseTo(100, 1);
  });

  it("computes pct correctly when partially spent", () => {
    const cats: BudgetCatRow[] = [{ categoryPrimary: "SHOPPING", limitAmount: 200 }];
    const spendingMap = buildSpendingMap([{ categoryPrimary: "SHOPPING", amount: 50 }]);
    const [line] = computeBudgetLines(cats, spendingMap);
    expect(line.pct).toBeCloseTo(25, 1);
  });

  it("sets pct to 100 when limitAmount is 0 and spent > 0 (fully overspent)", () => {
    const cats: BudgetCatRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", limitAmount: 0 }];
    const spendingMap = buildSpendingMap([{ categoryPrimary: "FOOD_AND_DRINK", amount: 10 }]);
    const [line] = computeBudgetLines(cats, spendingMap);
    expect(line.pct).toBe(100);
  });

  it("sets pct to 0 when limitAmount is 0 and spent is 0", () => {
    const cats: BudgetCatRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", limitAmount: 0 }];
    const [line] = computeBudgetLines(cats, new Map());
    expect(line.pct).toBe(0);
  });

  it("sorts lines descending by spend", () => {
    const cats: BudgetCatRow[] = [
      { categoryPrimary: "FOOD_AND_DRINK", limitAmount: 500 },
      { categoryPrimary: "SHOPPING", limitAmount: 300 },
      { categoryPrimary: "TRANSPORTATION", limitAmount: 100 },
    ];
    const spendingMap = buildSpendingMap([
      { categoryPrimary: "FOOD_AND_DRINK", amount: 200 },
      { categoryPrimary: "SHOPPING", amount: 400 },
      { categoryPrimary: "TRANSPORTATION", amount: 50 },
    ]);
    const lines = computeBudgetLines(cats, spendingMap);
    expect(lines[0].category).toBe("SHOPPING");
    expect(lines[1].category).toBe("FOOD_AND_DRINK");
    expect(lines[2].category).toBe("TRANSPORTATION");
  });
});

// ---------------------------------------------------------------------------
// computeDashboardSummary
// ---------------------------------------------------------------------------

describe("computeDashboardSummary", () => {
  const sampleSpending: SpendingRow[] = [
    { categoryPrimary: "FOOD_AND_DRINK", amount: 300 },
    { categoryPrimary: "SHOPPING", amount: 200 },
    { categoryPrimary: "TRANSPORTATION", amount: 80 },
    { categoryPrimary: "ENTERTAINMENT", amount: 60 },
    { categoryPrimary: "HEALTH_AND_WELLNESS", amount: 40 },
    { categoryPrimary: "UTILITIES", amount: 20 },
  ];

  const sampleBudgets: BudgetCatRow[] = [
    { categoryPrimary: "FOOD_AND_DRINK", limitAmount: 250 },
    { categoryPrimary: "SHOPPING", limitAmount: 300 },
    { categoryPrimary: "TRANSPORTATION", limitAmount: 100 },
  ];

  it("computes totalSpend as sum of ALL transaction amounts", () => {
    const { totalSpend } = computeDashboardSummary(sampleSpending, sampleBudgets);
    expect(totalSpend).toBeCloseTo(700, 2); // 300+200+80+60+40+20
  });

  it("computes totalBudget as sum of configured limits", () => {
    const { totalBudget } = computeDashboardSummary(sampleSpending, sampleBudgets);
    expect(totalBudget).toBe(650); // 250+300+100
  });

  it("computes totalRemaining = totalBudget - totalSpend", () => {
    const { totalRemaining, totalBudget, totalSpend } = computeDashboardSummary(
      sampleSpending,
      sampleBudgets
    );
    expect(totalRemaining).toBeCloseTo(totalBudget - totalSpend, 2);
  });

  it("returns topCategories sorted descending by spend, capped at topN", () => {
    const { topCategories } = computeDashboardSummary(sampleSpending, sampleBudgets, 3);
    expect(topCategories).toHaveLength(3);
    expect(topCategories[0].category).toBe("FOOD_AND_DRINK");
    expect(topCategories[0].spent).toBe(300);
    expect(topCategories[1].category).toBe("SHOPPING");
    expect(topCategories[2].category).toBe("TRANSPORTATION");
  });

  it("defaults topN to 5", () => {
    const { topCategories } = computeDashboardSummary(sampleSpending, sampleBudgets);
    expect(topCategories.length).toBeLessThanOrEqual(5);
  });

  it("identifies overspent categories correctly", () => {
    const { overspentCategories } = computeDashboardSummary(sampleSpending, sampleBudgets);
    // FOOD_AND_DRINK: spent 300 > limit 250 → overspent
    // SHOPPING: spent 200 < limit 300 → not overspent
    expect(overspentCategories).toHaveLength(1);
    expect(overspentCategories[0].category).toBe("FOOD_AND_DRINK");
    expect(overspentCategories[0].overspent).toBe(true);
  });

  it("returns empty overspentCategories when all are under budget", () => {
    const spending: SpendingRow[] = [{ categoryPrimary: "SHOPPING", amount: 100 }];
    const budgets: BudgetCatRow[] = [{ categoryPrimary: "SHOPPING", limitAmount: 200 }];
    const { overspentCategories } = computeDashboardSummary(spending, budgets);
    expect(overspentCategories).toHaveLength(0);
  });

  it("returns zero summary with no spending and no budgets", () => {
    const summary = computeDashboardSummary([], []);
    expect(summary.totalSpend).toBe(0);
    expect(summary.totalBudget).toBe(0);
    expect(summary.totalRemaining).toBe(0);
    expect(summary.topCategories).toHaveLength(0);
    expect(summary.overspentCategories).toHaveLength(0);
  });

  it("handles spending with no budgets: topCategories are included, no overspent", () => {
    const spending: SpendingRow[] = [
      { categoryPrimary: "FOOD_AND_DRINK", amount: 500 },
      { categoryPrimary: "SHOPPING", amount: 200 },
    ];
    const { topCategories, overspentCategories, totalBudget, budgetLines } =
      computeDashboardSummary(spending, []);
    expect(totalBudget).toBe(0);
    expect(budgetLines).toHaveLength(0);
    expect(overspentCategories).toHaveLength(0);
    expect(topCategories).toHaveLength(2);
    // null limit/remaining for unbudgeted categories
    expect(topCategories[0].limit).toBeNull();
    expect(topCategories[0].remaining).toBeNull();
  });

  it("topCategories includes budget info when category has a budget", () => {
    const spending: SpendingRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", amount: 300 }];
    const budgets: BudgetCatRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", limitAmount: 400 }];
    const { topCategories } = computeDashboardSummary(spending, budgets);
    expect(topCategories[0].limit).toBe(400);
    expect(topCategories[0].remaining).toBe(100);
    expect(topCategories[0].pct).toBeCloseTo(75, 1);
  });

  it("negative totalRemaining means over-budget overall", () => {
    const spending: SpendingRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", amount: 1000 }];
    const budgets: BudgetCatRow[] = [{ categoryPrimary: "FOOD_AND_DRINK", limitAmount: 500 }];
    const { totalRemaining } = computeDashboardSummary(spending, budgets);
    expect(totalRemaining).toBe(-500);
  });

  it("does not include categories in overspent that have no budget", () => {
    const spending: SpendingRow[] = [
      { categoryPrimary: "FOOD_AND_DRINK", amount: 9999 }, // huge spend but no budget
      { categoryPrimary: "SHOPPING", amount: 100 },
    ];
    const budgets: BudgetCatRow[] = [{ categoryPrimary: "SHOPPING", limitAmount: 50 }];
    const { overspentCategories } = computeDashboardSummary(spending, budgets);
    // Only SHOPPING is overspent (has budget); FOOD_AND_DRINK has no budget → never overspent
    expect(overspentCategories).toHaveLength(1);
    expect(overspentCategories[0].category).toBe("SHOPPING");
  });
});
