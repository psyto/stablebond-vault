"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { UserPosition } from "@stablebond/types";
import { sharesToValue, formatAmount } from "@stablebond/sdk";
import { AmountInput } from "@/components/shared/AmountInput";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface WithdrawFormProps {
  position: UserPosition | null;
  navPerShare: bigint;
  onWithdraw: (shares: bigint) => Promise<void>;
  loading: boolean;
}

export function WithdrawForm({
  position,
  navPerShare,
  onWithdraw,
  loading,
}: WithdrawFormProps) {
  const { connected } = useWallet();
  const [shares, setShares] = useState("");
  const maxShares = position?.currentShares ?? 0n;

  const sharesMinor = useMemo(() => {
    const parsed = parseFloat(shares);
    if (isNaN(parsed) || parsed <= 0) return 0n;
    return BigInt(Math.floor(parsed * 1_000_000));
  }, [shares]);

  const valuePreview =
    sharesMinor > 0n ? sharesToValue(sharesMinor, navPerShare) : 0n;

  const error =
    sharesMinor > maxShares ? "Exceeds available shares" : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sharesMinor === 0n || error) return;
    await onWithdraw(sharesMinor);
    setShares("");
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <h3 className="mb-4 text-lg font-semibold text-white">Withdraw</h3>

      <div className="space-y-4">
        <AmountInput
          value={shares}
          onChange={setShares}
          label="Shares"
          max={maxShares > 0n ? formatAmount(maxShares) : undefined}
          disabled={!connected || loading || maxShares === 0n}
          error={error}
        />

        {sharesMinor > 0n && !error && (
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Value</span>
              <span className="font-mono text-white">
                ${formatAmount(valuePreview)}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={
            !connected || loading || sharesMinor === 0n || !!error
          }
          className="btn-secondary w-full"
        >
          {loading ? <LoadingSpinner className="mx-auto" /> : "Withdraw"}
        </button>
      </div>
    </form>
  );
}
