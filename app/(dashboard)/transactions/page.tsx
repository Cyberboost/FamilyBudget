import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; category?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const member = await prisma.familyMember.findFirst({ where: { clerkId: userId } });
  if (!member) redirect("/dashboard");
  if (member.role === "KID") redirect("/kids");

  const { page: pageParam, search, category } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1"));
  const pageSize = 50;

  const where: Record<string, unknown> = { familyId: member.familyId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { merchantName: { contains: search, mode: "insensitive" } },
    ];
  }
  if (category) where.category = category;

  const [total, transactions, categories] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { account: { select: { name: true, mask: true } } },
    }),
    prisma.transaction.findMany({
      where: { familyId: member.familyId },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);

  const pages = Math.ceil(total / pageSize);
  const uniqueCategories = categories
    .map((c) => c.category ?? "Uncategorized")
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search merchant or description…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64"
        />
        <select
          name="category"
          defaultValue={category ?? ""}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All categories</option>
          {uniqueCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          Filter
        </button>
        {(search || category) && (
          <Link
            href="/transactions"
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No transactions found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(tx.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{tx.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {tx.account.name}
                    {tx.account.mask ? ` ····${tx.account.mask}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs">
                      {tx.category ?? "Uncategorized"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    ${Number(tx.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/transactions?page=${p}${search ? `&search=${search}` : ""}${category ? `&category=${category}` : ""}`}
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
