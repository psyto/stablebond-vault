"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { UserPosition } from "@stablebond/types";
import { unrealizedYield, formatAmount } from "@stablebond/sdk";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface ClaimYieldButtonProps {
  position: UserPosition | null;
  navPerShare: bigint;
  onClaim: () => Promise<void>;
  loading: boolean;
}

export function ClaimYieldButton({
  position,
  navPerShare,
  onClaim,
  loading,
}: ClaimYieldButtonProps) {
  const { connected } = useWallet();

  const yieldAmount = position
    ? unrealizedYield(position.currentShares, navPerShare, position.costBasis)
    : 0n;

  const hasYield = yieldAmount > 0n;

  return (
    <div className="card">
      <h3 className="mb-2 text-lg font-semibold text-white">Claim Yield</h3>
      <p className="mb-4 text-sm text-gray-400">
        Unrealized yield:{" "}
        <span className="font-mono text-accent-green">
          ${formatAmount(yieldAmount)}
        </span>
      </p>
      <button
        onClick={onClaim}
        disabled={!connected || loading || !hasYield}
        className="btn-primary w-full"
      >
        {loading ? (
          <LoadingSpinner className="mx-auto" />
        ) : (
          `Claim $${formatAmount(yieldAmount)}`
        )}
      </button>
    </div>
  );
}
