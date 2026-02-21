"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { YieldSourceAccount, BondType } from "@stablebond/types";
import { useProtocol } from "@/providers/ProtocolProvider";
import { useUserPortfolio } from "@/hooks/useUserPortfolio";
import { useStablebondClient } from "@/hooks/useStablebondClient";
import { PortfolioSummary } from "@/components/dashboard/PortfolioSummary";
import { PositionTable } from "@/components/dashboard/PositionTable";
import { PendingDepositsCard } from "@/components/dashboard/PendingDepositsCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import type { PendingDeposit } from "@stablebond/types";

export default function DashboardPage() {
  const { connected } = useWallet();
  const wallet = useWallet();
  const { bonds, loading: protocolLoading, error: protocolError } = useProtocol();
  const { positions, loading: portfolioLoading, error: portfolioError } = useUserPortfolio();
  const client = useStablebondClient();

  const [yieldSources, setYieldSources] = useState<Map<number, YieldSourceAccount>>(new Map());
  const [pendingDeposits, setPendingDeposits] = useState<PendingDeposit[]>([]);

  const fetchYieldSources = useCallback(async () => {
    if (bonds.length === 0) return;
    const sources = new Map<number, YieldSourceAccount>();
    for (const bond of bonds) {
      try {
        const ys = await client.getYieldSource(bond.currencyMint);
        if (ys) sources.set(bond.bondType, ys);
      } catch {}
    }
    setYieldSources(sources);
  }, [client, bonds]);

  const fetchPendingDeposits = useCallback(async () => {
    if (!wallet.publicKey || bonds.length === 0) return;
    const allDeposits: PendingDeposit[] = [];
    for (const bond of bonds) {
      try {
        const deps = await client.getPendingDeposits(wallet.publicKey, bond.bondType as BondType);
        allDeposits.push(...deps);
      } catch {}
    }
    setPendingDeposits(allDeposits);
  }, [client, wallet.publicKey, bonds]);

  useEffect(() => {
    fetchYieldSources();
    const id = setInterval(fetchYieldSources, 15_000);
    return () => clearInterval(id);
  }, [fetchYieldSources]);

  useEffect(() => {
    fetchPendingDeposits();
    const id = setInterval(fetchPendingDeposits, 10_000);
    return () => clearInterval(id);
  }, [fetchPendingDeposits]);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <h1 className="mb-2 text-2xl font-bold text-white">
          Welcome to Stablebond Vault
        </h1>
        <p className="text-gray-400">
          Connect your wallet to view your portfolio
        </p>
      </div>
    );
  }

  const loading = protocolLoading || portfolioLoading;
  const error = protocolError ?? portfolioError;

  if (loading && positions.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {error && <ErrorBanner message={error} />}

      <PortfolioSummary positions={positions} yieldSources={yieldSources} />
      <PositionTable positions={positions} yieldSources={yieldSources} />
      <PendingDepositsCard deposits={pendingDeposits} />
    </div>
  );
}
