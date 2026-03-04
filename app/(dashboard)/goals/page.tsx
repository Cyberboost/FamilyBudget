import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GoalEditor, type GoalItem } from "@/components/goals/GoalEditor";
import { GoalVisibility } from "@prisma/client";

export default async function GoalsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");

  const isKidOrTeen = member.role === "KID" || member.role === "TEEN";
  const isParent = member.role === "PARENT" || member.role === "PARENT_ADMIN";

  let rawGoals;
  if (isKidOrTeen) {
    rawGoals = await prisma.goal.findMany({
      where: {
        familyId: member.familyId,
        OR: [
          { shares: { some: { clerkId: userId } } },
          { visibility: GoalVisibility.FAMILY },
        ],
      },
      include: { shares: { select: { clerkId: true } } },
      orderBy: { createdAt: "desc" },
    });
  } else {
    rawGoals = await prisma.goal.findMany({
      where: { familyId: member.familyId },
      include: { shares: { select: { clerkId: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  const goals: GoalItem[] = rawGoals.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    type: g.type as GoalItem["type"],
    visibility: g.visibility as GoalItem["visibility"],
    targetAmount: Number(g.targetAmount),
    savedAmount: Number(g.savedAmount),
    targetDate: g.targetDate ? g.targetDate.toISOString() : null,
    isCompleted: g.isCompleted,
    shares: g.shares,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Goals</h1>
      </div>
      <GoalEditor initialGoals={goals} canEdit={isParent} />
    </div>
  );
}
