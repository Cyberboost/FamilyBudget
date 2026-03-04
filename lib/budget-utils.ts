/**
 * Pure calculation helpers for budget and dashboard summaries.
 *
 * All functions are side-effect-free: they accept plain data (already
 * fetched from the DB) and return computed results.  No Prisma imports
 * means the entire module is trivially unit-testable.
 *
 * Aggregation queries (groupBy / sum) are done in the calling route handlers;
 * these helpers only do arithmetic on the results.
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** One row from a Prisma transaction.groupBy({ by: ["categoryPrimary"], _sum: { amount } }) */
export interface SpendingRow {
  categoryPrimary: string | null;
  /** Already converted from Prisma Decimal to JS number. */
  amount: number;
}

/** One row from BudgetCategory (amounts already converted to number). */
export interface BudgetCatRow {
  categoryPrimary: string;
  limitAmount: number;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface CategoryBudgetLine {
  category: string;
  spent: number;
  /** null when no budget limit exists for this category. */
  limit: number | null;
  /** null when no budget limit exists. */
  remaining: number | null;
  /** Percentage of limit spent (0–100+), null when limit is null. */
  pct: number | null;
  overspent: boolean;
}

export interface DashboardSummary {
  /** Sum of all transaction amounts in the month. */
  totalSpend: number;
  /** Sum of all configured category limits (0 when no budgets set). */
  totalBudget: number;
  /** totalBudget − totalSpend (positive = under budget). */
  totalRemaining: number;
  /** Top 5 categories by spend, descending. */
  topCategories: CategoryBudgetLine[];
  /** Only categories that have a limit AND spent > limit. */
  overspentCategories: CategoryBudgetLine[];
  /** All budget lines (one per budgeted category). */
  budgetLines: CategoryBudgetLine[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a category → amount lookup from spending rows.
 * Null categoryPrimary is mapped to "Uncategorized".
 */
export function buildSpendingMap(rows: SpendingRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.categoryPrimary ?? "Uncategorized";
    map.set(key, (map.get(key) ?? 0) + row.amount);
  }
  return map;
}

/**
 * Compute per-category budget lines, merging spending data with budget limits.
 *
 * @param budgetCats  Configured budget categories for the month.
 * @param spendingMap Output of buildSpendingMap().
 * @returns One line per budgeted category, sorted descending by spend.
 */
export function computeBudgetLines(
  budgetCats: BudgetCatRow[],
  spendingMap: Map<string, number>
): CategoryBudgetLine[] {
  return budgetCats
    .map((c): CategoryBudgetLine => {
      const spent = spendingMap.get(c.categoryPrimary) ?? 0;
      const limit = c.limitAmount;
      const remaining = limit - spent;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      return {
        category: c.categoryPrimary,
        spent,
        limit,
        remaining,
        pct,
        overspent: spent > limit,
      };
    })
    .sort((a, b) => b.spent - a.spent);
}

/**
 * Compute the full dashboard summary from raw Prisma aggregation results.
 *
 * @param spendingRows   Result of transaction.groupBy by categoryPrimary for the month.
 * @param budgetCats     Configured budget categories for the month (empty array = no budget set).
 * @param topN           How many top categories to include (default 5).
 */
export function computeDashboardSummary(
  spendingRows: SpendingRow[],
  budgetCats: BudgetCatRow[],
  topN = 5
): DashboardSummary {
  const spendingMap = buildSpendingMap(spendingRows);

  // Total spend = sum of ALL transaction amounts regardless of budget
  const totalSpend = [...spendingMap.values()].reduce((a, b) => a + b, 0);

  // Budget lines (only categories with a configured limit)
  const budgetLines = computeBudgetLines(budgetCats, spendingMap);

  const totalBudget = budgetCats.reduce((a, c) => a + c.limitAmount, 0);
  const totalRemaining = totalBudget - totalSpend;

  // Top N categories by spend — merge all spending (budgeted or not)
  const allCategories: CategoryBudgetLine[] = [...spendingMap.entries()]
    .map(([category, spent]) => {
      const budgetLine = budgetLines.find((b) => b.category === category);
      return budgetLine ?? { category, spent, limit: null, remaining: null, pct: null, overspent: false };
    })
    .sort((a, b) => b.spent - a.spent);

  const topCategories = allCategories.slice(0, topN);

  const overspentCategories = budgetLines.filter((b) => b.overspent);

  return {
    totalSpend,
    totalBudget,
    totalRemaining,
    topCategories,
    overspentCategories,
    budgetLines,
  };
}
