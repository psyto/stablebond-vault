"use client";

import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { BondType } from "@stablebond/types";
import { useProtocol } from "@/providers/ProtocolProvider";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useBondVault } from "@/hooks/useBondVault";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { useDeposit } from "@/hooks/useDeposit";
import { useWithdraw } from "@/hooks/useWithdraw";
import { useClaimYield } from "@/hooks/useClaimYield";
import { BondDetailHeader } from "@/components/bonds/BondDetailHeader";
import { DepositForm } from "@/components/transactions/DepositForm";
import { WithdrawForm } from "@/components/transactions/WithdrawForm";
import { ClaimYieldButton } from "@/components/transactions/ClaimYieldButton";
import { TransactionStatus } from "@/components/transactions/TransactionStatus";
import { PendingDepositsCard } from "@/components/dashboard/PendingDepositsCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { StatCard } from "@/components/shared/StatCard";
import { sharesToValue, unrealizedYield, formatAmount } from "@stablebond/sdk";
import { PublicKey } from "@solana/web3.js";

export default function BondDetailPage() {
  const params = useParams();
  const bondType = parseInt(params.bondType as string) as BondType;
  const { connected } = useWallet();
  const { bonds, loading: protocolLoading } = useProtocol();

  const bond = bonds.find((b) => b.bondType === bondType);
  const { position, loading: posLoading } = useUserPosition(bondType);
  const { vault, loading: vaultLoading } = useBondVault(bondType);
  const { deposits } = usePendingDeposits(bondType);
  const { deposit, loading: depositLoading, txSignature: depositTx } = useDeposit();
  const { withdraw, loading: withdrawLoading, txSignature: withdrawTx } = useWithdraw();
  const { claim, loading: claimLoading, txSignature: claimTx } = useClaimYield();

  const nav = vault?.navPerShare ?? 1_000_000n;

  if (protocolLoading || vaultLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (!bond) {
    return <ErrorBanner message={`Bond type ${bondType} not found`} />;
  }

  const currentValue = position
    ? sharesToValue(position.currentShares, nav)
    : 0n;
  const unrealized = position
    ? unrealizedYield(position.currentShares, nav, position.costBasis)
    : 0n;

  const handleDeposit = async (amount: bigint) => {
    // Account derivation is handled inside the SDK client
    // For a full implementation, these would be derived from the bond config
    await deposit(amount, bondType, {
      yieldSourceMint: bond.currencyMint,
      userToken: PublicKey.default,
      depositVault: PublicKey.default,
      whitelistEntry: PublicKey.default,
      sovereignIdentity: PublicKey.default,
    });
  };

  const handleWithdraw = async (shares: bigint) => {
    await withdraw(shares, bondType, {
      yieldSourceMint: bond.currencyMint,
      depositVault: PublicKey.default,
      userToken: PublicKey.default,
    });
  };

  const handleClaim = async () => {
    await claim(bondType, {
      yieldSourceMint: bond.currencyMint,
      depositVault: PublicKey.default,
      userToken: PublicKey.default,
    });
  };

  return (
    <div className="space-y-6">
      <BondDetailHeader bond={bond} vault={vault} />

      {connected && position && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Your Value"
            value={`$${formatAmount(currentValue)}`}
          />
          <StatCard
            label="Your Shares"
            value={formatAmount(position.currentShares)}
          />
          <StatCard
            label="Unrealized Yield"
            value={`$${formatAmount(unrealized)}`}
            trend={unrealized > 0n ? "up" : "neutral"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <DepositForm
            bond={bond}
            position={position}
            navPerShare={nav}
            onDeposit={handleDeposit}
            loading={depositLoading}
          />
          <TransactionStatus signature={depositTx} loading={depositLoading} />
        </div>

        <div className="space-y-6">
          <WithdrawForm
            position={position}
            navPerShare={nav}
            onWithdraw={handleWithdraw}
            loading={withdrawLoading}
          />
          <ClaimYieldButton
            position={position}
            navPerShare={nav}
            onClaim={handleClaim}
            loading={claimLoading}
          />
          <TransactionStatus
            signature={withdrawTx ?? claimTx}
            loading={withdrawLoading || claimLoading}
          />
        </div>
      </div>

      <PendingDepositsCard deposits={deposits} />
    </div>
  );
}
