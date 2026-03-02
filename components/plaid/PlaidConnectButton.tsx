"use client";

import { useCallback, useState } from "react";
import {
  usePlaidLink,
  PlaidLinkOnSuccess,
  PlaidLinkOnExit,
} from "react-plaid-link";

interface PlaidConnectButtonProps {
  onSuccess?: () => void;
}

export function PlaidConnectButton({ onSuccess }: PlaidConnectButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchLinkToken() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create link token");
      setLinkToken(data.link_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  const handleSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      try {
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id,
            institution_name: metadata.institution?.name,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to exchange token");
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLinkToken(null);
        setLoading(false);
      }
    },
    [onSuccess]
  );

  const handleExit = useCallback<PlaidLinkOnExit>(() => {
    setLinkToken(null);
    setLoading(false);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: handleSuccess,
    onExit: handleExit,
  });

  // Once we have a link token, open Plaid Link automatically
  if (linkToken && ready) {
    open();
  }

  return (
    <div>
      <button
        onClick={fetchLinkToken}
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {loading ? "Connecting…" : "+ Connect Bank"}
      </button>
      {error && (
        <p className="text-red-600 text-xs mt-2">{error}</p>
      )}
    </div>
  );
}
