"use client";

import { NETWORK } from "@/lib/constants";

interface TransactionStatusProps {
  signature: string | null;
  loading: boolean;
}

export function TransactionStatus({
  signature,
  loading,
}: TransactionStatusProps) {
  if (!signature && !loading) return null;

  const explorerUrl = signature
    ? `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`
    : null;

  return (
    <div className="rounded-lg border border-surface-3 bg-surface-2 px-4 py-3 text-sm">
      {loading && (
        <div className="flex items-center gap-2 text-accent-amber">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent-amber border-t-transparent" />
          Transaction pending...
        </div>
      )}
      {signature && !loading && (
        <div className="flex items-center justify-between text-accent-green">
          <span>Transaction confirmed</span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-blue hover:underline"
            >
              View on Explorer
            </a>
          )}
        </div>
      )}
    </div>
  );
}
