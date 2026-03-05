"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!isLoaded || !user || !token) return;
    acceptInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user, token]);

  async function acceptInvite() {
    setStatus("loading");
    try {
      const email = user?.primaryEmailAddress?.emailAddress ?? "";
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, name: user?.fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to accept invite");
      setStatus("success");
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md text-center">
        {status === "idle" || status === "loading" ? (
          <>
            <div className="text-4xl mb-4">⏳</div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">Accepting your invite…</h1>
            <p className="text-gray-500 text-sm">Please wait a moment.</p>
          </>
        ) : status === "success" ? (
          <>
            <div className="text-4xl mb-4">🎉</div>
            <h1 className="text-xl font-bold text-green-700 mb-2">Welcome to the family!</h1>
            <p className="text-gray-500 text-sm">Redirecting to your dashboard…</p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-xl font-bold text-red-700 mb-2">Could not accept invite</h1>
            <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{errorMsg}</p>
            <a
              href="/dashboard"
              className="mt-4 inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
            >
              Go to Dashboard
            </a>
          </>
        )}
      </div>
    </div>
  );
}
