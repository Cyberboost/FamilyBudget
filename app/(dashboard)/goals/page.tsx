import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function GoalsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");

  let goals;
  if (member.role === "KID" || member.role === "TEEN") {
    goals = await prisma.goal.findMany({
      where: {
        familyId: member.familyId,
        shares: { some: { clerkId: userId } },
      },
      include: { shares: { select: { clerkId: true } } },
      orderBy: { createdAt: "desc" },
    });
  } else {
    goals = await prisma.goal.findMany({
      where: { familyId: member.familyId },
      include: { shares: { select: { clerkId: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  const isParent = member.role === "PARENT" || member.role === "PARENT_ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Goals</h1>
        {isParent && (
          <a
            href="/goals/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            + New Goal
          </a>
        )}
      </div>

      {goals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          {isParent
            ? "No goals yet. Create one to start tracking!"
            : "No goals have been shared with you yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => {
            const progress = Math.min(
              100,
              (Number(goal.savedAmount) / Number(goal.targetAmount)) * 100
            );
            const daysLeft = goal.targetDate
              ? Math.ceil(
                  (new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                )
              : null;

            return (
              <div
                key={goal.id}
                className={`bg-white rounded-xl shadow-sm border p-6 ${
                  goal.isCompleted ? "border-green-200 bg-green-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">{goal.name}</h3>
                    {goal.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{goal.description}</p>
                    )}
                  </div>
                  {goal.isCompleted && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                      ✓ Done
                    </span>
                  )}
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium">
                      ${Number(goal.savedAmount).toFixed(2)} / $
                      {Number(goal.targetAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        goal.isCompleted ? "bg-green-500" : "bg-indigo-500"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-gray-400 mt-0.5">
                    {Math.round(progress)}%
                  </div>
                </div>

                {daysLeft !== null && !goal.isCompleted && (
                  <div
                    className={`text-xs ${
                      daysLeft < 0
                        ? "text-red-500"
                        : daysLeft < 30
                          ? "text-amber-500"
                          : "text-gray-400"
                    }`}
                  >
                    {daysLeft < 0
                      ? `${Math.abs(daysLeft)} days overdue`
                      : `${daysLeft} days remaining`}
                  </div>
                )}

                {isParent && (
                  <div className="mt-3 text-xs text-gray-400">
                    Shared with {goal.shares.length} member(s)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
