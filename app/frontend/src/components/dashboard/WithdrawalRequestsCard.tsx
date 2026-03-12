"use client";

import { useState, useEffect } from "react";
import type { WithdrawalRequest } from "@stablebond/sdk";
import { formatAmount } from "@stablebond/sdk";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface WithdrawalRequestsCardProps {
  requests: WithdrawalRequest[];
  onClaim: (nonce: bigint) => Promise<void>;
  onCancel: (nonce: bigint) => Promise<void>;
  loading: boolean;
}

function CooldownTimer({ claimableAt }: { claimableAt: bigint }) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Number(claimableAt) - now;
      setRemaining(diff > 0 ? diff : 0);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [claimableAt]);

  if (remaining <= 0) {
    return <span className="text-accent-green font-medium">Ready to claim</span>;
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return (
    <span className="font-mono text-yellow-400">
      {hours > 0 && `${hours}h `}
      {minutes}m {seconds}s
    </span>
  );
}

export function WithdrawalRequestsCard({
  requests,
  onClaim,
  onCancel,
  loading,
}: WithdrawalRequestsCardProps) {
  if (requests.length === 0) return null;

  return (
    <div className="card">
      <h3 className="mb-4 text-lg font-semibold text-white">
        Pending Withdrawals
      </h3>

      <div className="space-y-3">
        {requests.map((req) => {
          const now = Math.floor(Date.now() / 1000);
          const isClaimable = now >= Number(req.claimableAt);

          return (
            <div
              key={req.nonce.toString()}
              className="flex items-center justify-between rounded-lg bg-surface-2 p-4"
            >
              <div className="space-y-1">
                <div className="text-sm text-gray-400">
                  {formatAmount(req.shares)} shares
                </div>
                <div className="text-xs text-gray-500">
                  Value: ${formatAmount(req.amountOut)}
                </div>
                <div className="text-xs">
                  <CooldownTimer claimableAt={req.claimableAt} />
                </div>
              </div>

              <div className="flex gap-2">
                {isClaimable ? (
                  <button
                    onClick={() => onClaim(req.nonce)}
                    disabled={loading}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {loading ? (
                      <LoadingSpinner className="h-4 w-4" />
                    ) : (
                      "Claim"
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => onCancel(req.nonce)}
                    disabled={loading}
                    className="btn-ghost px-4 py-2 text-sm text-red-400 hover:text-red-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
