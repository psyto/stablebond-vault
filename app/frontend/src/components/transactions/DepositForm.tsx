"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { BondConfig, UserPosition } from "@stablebond/types";
import { BOND_CURRENCIES, Tier } from "@stablebond/types";
import {
  validateDeposit,
  getRemainingCapacity,
  valueToShares,
} from "@stablebond/sdk";
import { formatAmount } from "@stablebond/sdk";
import { AmountInput } from "@/components/shared/AmountInput";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface DepositFormProps {
  bond: BondConfig;
  position: UserPosition | null;
  navPerShare: bigint;
  onDeposit: (amount: bigint) => Promise<void>;
  loading: boolean;
}

export function DepositForm({
  bond,
  position,
  navPerShare,
  onDeposit,
  loading,
}: DepositFormProps) {
  const { connected } = useWallet();
  const [amount, setAmount] = useState("");
  const currency = BOND_CURRENCIES[bond.bondType] ?? "USD";
  const tier = (position?.sovereignTier ?? Tier.Unverified) as Tier;
  const monthlyDeposited = position?.monthlyDeposited ?? 0n;

  const amountMinor = useMemo(() => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return 0n;
    return BigInt(Math.floor(parsed * 1_000_000));
  }, [amount]);

  const validationError = useMemo(() => {
    if (amountMinor === 0n) return null;
    return validateDeposit(tier, bond.bondType, amountMinor, monthlyDeposited);
  }, [tier, bond.bondType, amountMinor, monthlyDeposited]);

  const remaining = getRemainingCapacity(tier, bond.bondType, monthlyDeposited);
  const estimatedShares =
    amountMinor > 0n ? valueToShares(amountMinor, navPerShare) : 0n;

  const maxStr =
    remaining >= BigInt(Number.MAX_SAFE_INTEGER)
      ? undefined
      : formatAmount(remaining);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountMinor === 0n || validationError) return;
    await onDeposit(amountMinor);
    setAmount("");
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <h3 className="mb-4 text-lg font-semibold text-white">Deposit</h3>

      <div className="space-y-4">
        <AmountInput
          value={amount}
          onChange={setAmount}
          label="Amount"
          currency={currency}
          max={maxStr}
          disabled={!connected || loading}
          error={validationError ?? undefined}
        />

        {amountMinor > 0n && !validationError && (
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Estimated Shares</span>
              <span className="font-mono text-white">
                {formatAmount(estimatedShares)}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={
            !connected || loading || amountMinor === 0n || !!validationError
          }
          className="btn-primary w-full"
        >
          {loading ? (
            <LoadingSpinner className="mx-auto" />
          ) : !connected ? (
            "Connect Wallet"
          ) : (
            "Deposit"
          )}
        </button>
      </div>
    </form>
  );
}
