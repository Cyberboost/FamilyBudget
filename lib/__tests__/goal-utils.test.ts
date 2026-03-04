/**
 * Unit tests for lib/goal-utils.ts
 *
 * All tests are pure: no database, no Prisma, no network.
 */
import { describe, it, expect } from "vitest";
import {
  computeGoalProgress,
  monthlyAllowanceEquivalent,
  computeKidOverview,
  type GoalRow,
  type AllowanceRow,
  type CategorySpend,
} from "../goal-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: "goal_1",
    name: "Vacation Fund",
    type: "SAVINGS",
    targetAmount: 1000,
    savedAmount: 250,
    targetDate: null,
    isCompleted: false,
    visibility: "FAMILY",
    ...overrides,
  };
}

function makeAllowance(overrides: Partial<AllowanceRow> = {}): AllowanceRow {
  return {
    id: "allowance_1",
    amount: 20,
    cadence: "WEEKLY",
    jarsJson: null,
    ...overrides,
  };
}

// Fixed "now" so tests are deterministic
const NOW = new Date("2025-06-15T12:00:00.000Z");

// ---------------------------------------------------------------------------
// computeGoalProgress
// ---------------------------------------------------------------------------

describe("computeGoalProgress", () => {
  it("computes pct correctly when partially saved", () => {
    const goal = makeGoal({ targetAmount: 1000, savedAmount: 250 });
    const result = computeGoalProgress(goal, NOW);
    expect(result.pct).toBeCloseTo(25, 1);
    expect(result.remaining).toBe(750);
  });

  it("caps pct at 100 when savedAmount exceeds target", () => {
    const goal = makeGoal({ targetAmount: 100, savedAmount: 120 });
    const result = computeGoalProgress(goal, NOW);
    expect(result.pct).toBe(100);
  });

  it("returns pct=0 when targetAmount is 0", () => {
    const goal = makeGoal({ targetAmount: 0, savedAmount: 0 });
    const result = computeGoalProgress(goal, NOW);
    expect(result.pct).toBe(0);
  });

  it("remaining is 0 (not negative) when savedAmount >= targetAmount", () => {
    const goal = makeGoal({ targetAmount: 100, savedAmount: 150 });
    const result = computeGoalProgress(goal, NOW);
    expect(result.remaining).toBe(0);
  });

  it("daysLeft is null when targetDate is null", () => {
    const result = computeGoalProgress(makeGoal({ targetDate: null }), NOW);
    expect(result.daysLeft).toBeNull();
  });

  it("daysLeft is positive when target is in the future", () => {
    const targetDate = new Date("2025-06-20T00:00:00.000Z"); // 5 days after NOW (June 15)
    const result = computeGoalProgress(makeGoal({ targetDate }), NOW);
    expect(result.daysLeft).toBe(5);
  });

  it("daysLeft is 0 when targetDate is today", () => {
    const targetDate = new Date("2025-06-15T00:00:00.000Z"); // same day as NOW
    const result = computeGoalProgress(makeGoal({ targetDate }), NOW);
    expect(result.daysLeft).toBe(0);
  });

  it("daysLeft is negative when targetDate is in the past", () => {
    const targetDate = new Date("2025-06-10T00:00:00.000Z"); // 5 days before NOW
    const result = computeGoalProgress(makeGoal({ targetDate }), NOW);
    expect(result.daysLeft).toBe(-5);
  });

  it("passes through isCompleted flag", () => {
    const result = computeGoalProgress(makeGoal({ isCompleted: true }), NOW);
    expect(result.isCompleted).toBe(true);
  });

  it("passes through id, name, type, visibility", () => {
    const goal = makeGoal({ id: "g42", name: "Test", type: "SPENDING", visibility: "PRIVATE" });
    const result = computeGoalProgress(goal, NOW);
    expect(result.id).toBe("g42");
    expect(result.name).toBe("Test");
    expect(result.type).toBe("SPENDING");
    expect(result.visibility).toBe("PRIVATE");
  });
});

// ---------------------------------------------------------------------------
// monthlyAllowanceEquivalent
// ---------------------------------------------------------------------------

describe("monthlyAllowanceEquivalent", () => {
  it("returns the amount as-is for MONTHLY cadence", () => {
    const allowance = makeAllowance({ amount: 100, cadence: "MONTHLY" });
    expect(monthlyAllowanceEquivalent(allowance)).toBe(100);
  });

  it("converts weekly to monthly equivalent (amount * 52 / 12)", () => {
    const allowance = makeAllowance({ amount: 12, cadence: "WEEKLY" });
    expect(monthlyAllowanceEquivalent(allowance)).toBeCloseTo((12 * 52) / 12, 5);
  });

  it("handles zero allowance", () => {
    expect(monthlyAllowanceEquivalent(makeAllowance({ amount: 0, cadence: "WEEKLY" }))).toBe(0);
    expect(monthlyAllowanceEquivalent(makeAllowance({ amount: 0, cadence: "MONTHLY" }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeKidOverview
// ---------------------------------------------------------------------------

describe("computeKidOverview", () => {
  const goals: GoalRow[] = [
    makeGoal({ id: "g1", name: "Bike", targetAmount: 500, savedAmount: 100 }),
    makeGoal({ id: "g2", name: "Game", targetAmount: 60, savedAmount: 60, isCompleted: true }),
  ];

  const spending: CategorySpend[] = [
    { category: "FOOD_AND_DRINK", amount: 40 },
    { category: "ENTERTAINMENT", amount: 20 },
  ];

  it("includes progress for all goals", () => {
    const { goals: out } = computeKidOverview(goals, spending, null, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("g1");
    expect(out[0].pct).toBeCloseTo(20, 1);
    expect(out[1].isCompleted).toBe(true);
  });

  it("computes totalSpend as sum of all spending rows", () => {
    const { totalSpend } = computeKidOverview(goals, spending, null, NOW);
    expect(totalSpend).toBe(60);
  });

  it("passes spendByCategory through unchanged", () => {
    const { spendByCategory } = computeKidOverview(goals, spending, null, NOW);
    expect(spendByCategory).toEqual(spending);
  });

  it("returns null monthlyAllowance when allowance is null", () => {
    const { monthlyAllowance } = computeKidOverview(goals, spending, null, NOW);
    expect(monthlyAllowance).toBeNull();
  });

  it("returns monthlyAllowance for MONTHLY cadence", () => {
    const allowance = makeAllowance({ amount: 50, cadence: "MONTHLY" });
    const { monthlyAllowance } = computeKidOverview(goals, spending, allowance, NOW);
    expect(monthlyAllowance).toBe(50);
  });

  it("returns monthlyAllowance for WEEKLY cadence", () => {
    const allowance = makeAllowance({ amount: 10, cadence: "WEEKLY" });
    const { monthlyAllowance } = computeKidOverview(goals, spending, allowance, NOW);
    expect(monthlyAllowance).toBeCloseTo((10 * 52) / 12, 5);
  });

  it("returns empty goals and zero spend for empty input", () => {
    const overview = computeKidOverview([], [], null, NOW);
    expect(overview.goals).toHaveLength(0);
    expect(overview.totalSpend).toBe(0);
    expect(overview.monthlyAllowance).toBeNull();
  });
});
