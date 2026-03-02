import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold text-indigo-700 mb-4">FamilyBudget</h1>
        <p className="text-xl text-gray-600 mb-8">
          Secure family finance management. Connect your bank accounts, set budgets, track goals,
          and give kids a clear view of family finances.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <SignedOut>
            <Link
              href="/sign-up"
              className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Get Started Free
            </Link>
            <Link
              href="/sign-in"
              className="px-8 py-3 border-2 border-indigo-600 text-indigo-600 rounded-lg font-semibold hover:bg-indigo-50 transition"
            >
              Sign In
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Go to Dashboard →
            </Link>
          </SignedIn>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {[
            {
              icon: "🏦",
              title: "Bank-Connected",
              desc: "Read-only Plaid integration keeps bank credentials off our servers.",
            },
            {
              icon: "👨‍👩‍👧‍👦",
              title: "Family Roles",
              desc: "Parent Admin, Parent, Teen, and Kid roles with fine-grained sharing.",
            },
            {
              icon: "🎯",
              title: "Goals & Budgets",
              desc: "Monthly category budgets, savings goals, and kid-friendly progress views.",
            },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-white rounded-xl p-6 shadow-sm">
              <div className="text-3xl mb-2">{icon}</div>
              <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
              <p className="text-gray-500 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
