import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({
    where: { clerkId: userId },
    include: { family: true },
  });
  if (!member) redirect("/dashboard");

  const isParent = member.role === "PARENT" || member.role === "PARENT_ADMIN";

  const [plaidItems, members, pendingInvites] = await Promise.all([
    prisma.plaidItem.findMany({
      where: { familyId: member.familyId },
      include: { accounts: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.familyMember.findMany({
      where: { familyId: member.familyId },
      orderBy: { createdAt: "asc" },
    }),
    isParent
      ? prisma.invite.findMany({
          where: { familyId: member.familyId, status: "PENDING" },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      {/* Family info */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Family Workspace
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-800">{member.family.name}</div>
            <div className="text-sm text-gray-500">Your role: {member.role.replace("_", " ")}</div>
          </div>
        </div>
      </section>

      {/* Connected banks */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Connected Banks</h2>
          {isParent && (
            <button
              id="plaid-connect-btn"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              + Connect Bank
            </button>
          )}
        </div>

        {plaidItems.length === 0 ? (
          <p className="text-gray-400 text-sm">No bank accounts connected yet.</p>
        ) : (
          <div className="space-y-4">
            {plaidItems.map((item) => (
              <div key={item.id} className="border border-gray-100 rounded-lg p-4">
                <div className="font-medium text-gray-800">
                  {item.institutionName ?? "Unknown Institution"}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {item.accounts.length} account(s)
                </div>
                <div className="mt-2 space-y-1">
                  {item.accounts.map((acct) => (
                    <div key={acct.id} className="text-sm text-gray-600 flex gap-2">
                      <span>{acct.name}</span>
                      {acct.mask && <span className="text-gray-400">····{acct.mask}</span>}
                      <span className="text-xs text-gray-400">({acct.type})</span>
                    </div>
                  ))}
                </div>
                {item.lastSyncedAt && (
                  <div className="text-xs text-gray-400 mt-2">
                    Last synced: {new Date(item.lastSyncedAt).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Family members */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Family Members</h2>
          {isParent && (
            <a
              href="/settings/invite"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              + Invite Member
            </a>
          )}
        </div>

        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between py-2 border-b border-gray-50"
            >
              <div>
                <div className="font-medium text-gray-800">
                  {m.name ?? m.email}
                  {m.clerkId === userId && (
                    <span className="ml-2 text-xs text-indigo-600">(you)</span>
                  )}
                </div>
                {m.name && (
                  <div className="text-sm text-gray-400">{m.email}</div>
                )}
              </div>
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                {m.role.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Pending invites */}
      {isParent && pendingInvites.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Pending Invites</h2>
          <div className="space-y-2">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between py-2 border-b border-gray-50"
              >
                <div>
                  <div className="font-medium text-gray-800">{inv.email}</div>
                  <div className="text-sm text-gray-400">
                    {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                  pending
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
