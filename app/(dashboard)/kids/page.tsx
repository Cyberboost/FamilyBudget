import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function KidsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");

  // This page is the kid-friendly view. Parents can preview it.
  const isKidOrTeen = member.role === "KID" || member.role === "TEEN";

  const sharedGoals = await prisma.goal.findMany({
    where: isKidOrTeen
      ? {
          familyId: member.familyId,
          shares: { some: { clerkId: userId } },
        }
      : { familyId: member.familyId },
    include: { shares: { select: { clerkId: true } } },
    orderBy: { createdAt: "desc" },
  });

  const name = member.name ?? "there";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-indigo-700">
          Hi, {name}! 👋
        </h1>
        <p className="text-gray-500 mt-1">
          Here are your goals and savings progress.
        </p>
      </div>

      {/* Goals */}
      {sharedGoals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-gray-500">
            No goals have been shared with you yet. Ask a parent to share one!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {sharedGoals.map((goal) => {
            const progress = Math.min(
              100,
              (Number(goal.savedAmount) / Number(goal.targetAmount)) * 100
            );
            const remaining = Math.max(
              0,
              Number(goal.targetAmount) - Number(goal.savedAmount)
            );
            const daysLeft = goal.targetDate
              ? Math.ceil(
                  (new Date(goal.targetDate).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24)
                )
              : null;

            return (
              <div
                key={goal.id}
                className={`bg-white rounded-2xl shadow border p-6 ${
                  goal.isCompleted ? "border-green-300 bg-green-50" : "border-indigo-100"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">
                    {goal.isCompleted ? "🏆" : "⭐"}
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-gray-800">{goal.name}</h3>
                    {goal.description && (
                      <p className="text-sm text-gray-500">{goal.description}</p>
                    )}
                  </div>
                </div>

                {/* Big progress ring substitute */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Saved</span>
                    <span className="font-bold text-indigo-700">
                      ${Number(goal.savedAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-6 rounded-full transition-all flex items-center justify-end pr-2 text-xs text-white font-bold ${
                        goal.isCompleted ? "bg-green-500" : "bg-indigo-500"
                      }`}
                      style={{ width: `${Math.max(8, progress)}%` }}
                    >
                      {Math.round(progress)}%
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>$0</span>
                    <span>Goal: ${Number(goal.targetAmount).toFixed(2)}</span>
                  </div>
                </div>

                {!goal.isCompleted && (
                  <div className="text-sm text-gray-600">
                    Still need:{" "}
                    <strong className="text-gray-800">${remaining.toFixed(2)}</strong>
                  </div>
                )}

                {daysLeft !== null && !goal.isCompleted && (
                  <div
                    className={`text-xs mt-2 ${
                      daysLeft < 0
                        ? "text-red-500"
                        : daysLeft < 14
                          ? "text-amber-500"
                          : "text-gray-400"
                    }`}
                  >
                    {daysLeft < 0
                      ? `${Math.abs(daysLeft)} days past target`
                      : `${daysLeft} days to go`}
                  </div>
                )}

                {goal.isCompleted && (
                  <div className="mt-2 text-green-700 font-semibold text-sm">
                    🎉 Goal complete!
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Allowance placeholder */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">💵</span>
          <div>
            <h2 className="font-semibold text-amber-800">Allowance</h2>
            <p className="text-sm text-amber-700">
              Allowance tracking is coming soon! Your parents will be able to record
              your allowance here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
