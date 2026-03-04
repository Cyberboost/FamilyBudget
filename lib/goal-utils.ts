/**
 * Pure calculation helpers for goal and kid-overview summaries.
 *
 * All functions are side-effect-free: they accept plain data (already fetched
 * from the DB) and return computed results. No Prisma imports means the entire
 * module is trivially unit-testable.
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface GoalRow {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: Date | null;
  isCompleted: boolean;
  visibility: string;
}

/** One row from a category spending aggregation (already converted to number). */
export interface CategorySpend {
  category: string;
  amount: number;
}

export interface AllowanceRow {
  id: string;
  amount: number;
  cadence: string; // "WEEKLY" | "MONTHLY"
  jarsJson: Record<string, number> | null;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface GoalProgress {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  savedAmount: number;
  remaining: number;
  /** Percentage saved toward target (0–100). */
  pct: number;
  targetDate: Date | null;
  /** Whole-day countdown to targetDate; null if no targetDate; negative = overdue. */
  daysLeft: number | null;
  isCompleted: boolean;
  visibility: string;
}

export interface KidOverviewSummary {
  goals: GoalProgress[];
  /** Monthly allowance equivalent (weekly * 52 / 12). */
  monthlyAllowance: number | null;
  /** Spend by category for the current month. */
  spendByCategory: CategorySpend[];
  totalSpend: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute progress metrics for a single goal.
 * All arithmetic is done here so routes stay thin.
 */
export function computeGoalProgress(goal: GoalRow, now: Date = new Date()): GoalProgress {
  const saved = goal.savedAmount;
  const target = goal.targetAmount;
  const remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  let daysLeft: number | null = null;
  if (goal.targetDate) {
    // Truncate both dates to midnight to avoid partial-day drift.
    // Use Math.round to handle DST edge cases correctly for both positive
    // (future) and negative (overdue) values.
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetDay = new Date(
      goal.targetDate.getFullYear(),
      goal.targetDate.getMonth(),
      goal.targetDate.getDate()
    ).getTime();
    daysLeft = Math.round((targetDay - nowDay) / (1000 * 60 * 60 * 24));
  }

  return {
    id: goal.id,
    name: goal.name,
    type: goal.type,
    targetAmount: target,
    savedAmount: saved,
    remaining,
    pct,
    targetDate: goal.targetDate,
    daysLeft,
    isCompleted: goal.isCompleted,
    visibility: goal.visibility,
  };
}

/**
 * Compute the monthly allowance equivalent from an AllowanceRow.
 *   MONTHLY → amount as-is
 *   WEEKLY  → amount * 52 / 12
 */
export function monthlyAllowanceEquivalent(allowance: AllowanceRow): number {
  if (allowance.cadence === "MONTHLY") return allowance.amount;
  // WEEKLY
  return (allowance.amount * 52) / 12;
}

/**
 * Build the full kid overview summary from pre-fetched DB data.
 *
 * @param goals           Goals the kid can see (already filtered by visibility/shares).
 * @param spendByCategory Category spend for the month (pre-aggregated).
 * @param allowance       The kid's allowance record, or null.
 * @param now             Inject current time for testability.
 */
export function computeKidOverview(
  goals: GoalRow[],
  spendByCategory: CategorySpend[],
  allowance: AllowanceRow | null,
  now: Date = new Date()
): KidOverviewSummary {
  const goalProgress = goals.map((g) => computeGoalProgress(g, now));

  const totalSpend = spendByCategory.reduce((a, c) => a + c.amount, 0);

  const monthlyAllowance = allowance ? monthlyAllowanceEquivalent(allowance) : null;

  return {
    goals: goalProgress,
    monthlyAllowance,
    spendByCategory,
    totalSpend,
  };
}
