import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Suspense } from "react";
import { MonthPicker } from "@/components/transactions/MonthPicker";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import type { DrawerTransaction } from "@/components/transactions/TransactionDrawer";
import { formatCategory } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    q?: string;
    category?: string;
    accountId?: string;
    page?: string;
  }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");
  if (member.role === "KID") redirect("/kids");

  const params = await searchParams;
  const month = params.month ?? currentMonthStr();
  const q = params.q ?? "";
  const category = params.category ?? "";
  const accountId = params.accountId ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 50;

  // Parse month into date range
  const [yr, mo] = month.split("-").map(Number);
  const startDate = new Date(yr, mo - 1, 1);
  const endDate = new Date(yr, mo, 1); // exclusive

  // Build where clause
  const where: Record<string, unknown> = {
    familyId: member.familyId,
    date: { gte: startDate, lt: endDate },
  };

  // Collect AND conditions so q + category can coexist without overwriting each other
  const andConditions: Record<string, unknown>[] = [];
  if (q) {
    andConditions.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { merchantName: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (category) {
    andConditions.push({
      OR: [{ userCategoryOverride: category }, { categoryPrimary: category }],
    });
  }
  if (andConditions.length > 0) where.AND = andConditions;
  if (accountId) where.accountId = accountId;

  const [total, transactions, accounts, categoryRows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { account: { select: { name: true, mask: true, type: true } } },
    }),
    prisma.account.findMany({
      where: { familyId: member.familyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, mask: true },
    }),
    prisma.transaction.findMany({
      where: { familyId: member.familyId },
      select: { categoryPrimary: true, userCategoryOverride: true },
      distinct: ["categoryPrimary"],
      orderBy: { categoryPrimary: "asc" },
    }),
  ]);

  const pages = Math.ceil(total / pageSize);

  // Collect unique categories from existing data
  const uniqueCategories = Array.from(
    new Set(
      categoryRows
        .flatMap((r) => [r.userCategoryOverride, r.categoryPrimary])
        .filter((c): c is string => c !== null && c !== undefined)
    )
  ).sort();

  // Cast to DrawerTransaction for the client component
  const drawerTxs: DrawerTransaction[] = transactions.map((tx) => ({
    ...tx,
    amount: Number(tx.amount),
  }));

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <Suspense>
          <MonthPicker currentMonth={month} />
        </Suspense>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3" method="GET" action="/transactions">
        {/* Keep month in hidden input so it survives filter submits */}
        <input type="hidden" name="month" value={month} />

        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search merchant or description…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
        />

        <select
          name="accountId"
          defaultValue={accountId}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.mask ? ` ····${a.mask}` : ""}
            </option>
          ))}
        </select>

        <select
          name="category"
          defaultValue={category}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All categories</option>
          {uniqueCategories.map((cat) => (
            <option key={cat} value={cat}>
              {formatCategory(cat)}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          Filter
        </button>

        {(q || category || accountId) && (
          <Link
            href={`/transactions?month=${month}`}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Result count */}
      <p className="text-sm text-gray-500">
        {total} transaction{total !== 1 ? "s" : ""}
        {total > pageSize ? ` — page ${page} of ${pages}` : ""}
      </p>

      {/* Table + drawer (client component) */}
      <TransactionsTable initialTransactions={drawerTxs} />

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/transactions?month=${month}&page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}${category ? `&category=${encodeURIComponent(category)}` : ""}${accountId ? `&accountId=${accountId}` : ""}`}
              className={`px-3 py-1 rounded text-sm border ${
                p === page
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
