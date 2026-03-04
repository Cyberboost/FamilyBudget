import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ShareSelector, type ShareableMember } from "@/components/goals/ShareSelector";
import { GoalProgressEditor } from "@/components/goals/GoalProgressEditor";
import { computeGoalProgress } from "@/lib/goal-utils";
import { GoalVisibility } from "@prisma/client";

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");

  const isParent = member.role === "PARENT" || member.role === "PARENT_ADMIN";
  const isKidOrTeen = member.role === "KID" || member.role === "TEEN";

  const goal = await prisma.goal.findUnique({
    where: { id },
    include: { shares: { select: { clerkId: true } } },
  });

  if (!goal || goal.familyId !== member.familyId) notFound();

  // Kids/teens can only see goals visible to them
  if (isKidOrTeen) {
    const canSee =
      goal.visibility === GoalVisibility.FAMILY ||
      goal.shares.some((s) => s.clerkId === userId);
    if (!canSee) notFound();
  }

  const progress = computeGoalProgress(
    {
      id: goal.id,
      name: goal.name,
      type: goal.type,
      targetAmount: Number(goal.targetAmount),
      savedAmount: Number(goal.savedAmount),
      targetDate: goal.targetDate,
      isCompleted: goal.isCompleted,
      visibility: goal.visibility,
    },
    new Date()
  );

  // For the share selector: fetch kids and teens in the family
  const shareableMembers: ShareableMember[] = isParent
    ? (
        await prisma.familyMember.findMany({
          where: {
            familyId: member.familyId,
            role: { in: ["KID", "TEEN"] },
          },
          orderBy: { name: "asc" },
        })
      ).map((m) => ({
        clerkId: m.clerkId,
        name: m.name,
        email: m.email,
        role: m.role,
      }))
    : [];

  const sharedWith = goal.shares.map((s) => s.clerkId);

  const visibilityLabel: Record<string, string> = {
    PRIVATE: "Private (parents only)",
    FAMILY: "Family (everyone)",
    SHARED_WITH_MEMBERS: "Specific members",
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/goals" className="hover:text-indigo-600 hover:underline">
          Goals
        </Link>
        <span>›</span>
        <span className="text-gray-800 font-medium">{goal.name}</span>
      </div>

      {/* Goal header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{goal.name}</h1>
            {goal.description && (
              <p className="text-sm text-gray-500 mt-1">{goal.description}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full">
                {goal.type}
              </span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                {visibilityLabel[goal.visibility] ?? goal.visibility}
              </span>
              {goal.isCompleted && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                  ✓ Complete
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">Progress</span>
            <span className="font-bold text-gray-900">
              ${progress.savedAmount.toFixed(2)} / ${progress.targetAmount.toFixed(2)}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all ${goal.isCompleted ? "bg-green-500" : "bg-indigo-500"}`}
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{Math.round(progress.pct)}% saved</span>
            <span>${progress.remaining.toFixed(2)} remaining</span>
          </div>
        </div>

        {/* Days left */}
        {progress.daysLeft !== null && !goal.isCompleted && (
          <div
            className={`text-sm font-medium ${
              progress.daysLeft < 0
                ? "text-red-500"
                : progress.daysLeft < 30
                ? "text-amber-500"
                : "text-gray-500"
            }`}
          >
            {progress.daysLeft < 0
              ? `⚠️ ${Math.abs(progress.daysLeft)} days overdue`
              : `🗓 ${progress.daysLeft} days until target date`}
          </div>
        )}

        {/* Edit saved amount (parents only) */}
        {isParent && (
          <GoalProgressEditor
            goalId={goal.id}
            savedAmount={Number(goal.savedAmount)}
            targetAmount={Number(goal.targetAmount)}
            isCompleted={goal.isCompleted}
          />
        )}
      </div>

      {/* Share selector (parents only) */}
      {isParent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Share with Family Members</h2>
          <p className="text-sm text-gray-500">
            Current visibility: <strong>{visibilityLabel[goal.visibility] ?? goal.visibility}</strong>.
            The members below are selected for direct sharing (used when visibility is &quot;Specific members&quot;).
          </p>
          <ShareSelector
            goalId={goal.id}
            members={shareableMembers}
            initialSharedWith={sharedWith}
          />
        </div>
      )}
    </div>
  );
}
