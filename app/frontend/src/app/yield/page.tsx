"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { YieldSourceAccount } from "@stablebond/types";
import { useProtocol } from "@/providers/ProtocolProvider";
import { useUserPortfolio } from "@/hooks/useUserPortfolio";
import { useStablebondClient } from "@/hooks/useStablebondClient";
import { YieldSummaryCard } from "@/components/yield/YieldSummaryCard";
import { YieldBreakdownTable } from "@/components/yield/YieldBreakdownTable";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

export default function YieldPage() {
  const { connected } = useWallet();
  const { bonds, loading: protocolLoading } = useProtocol();
  const { positions, loading: portfolioLoading, error } = useUserPortfolio();
  const client = useStablebondClient();

  const [yieldSources, setYieldSources] = useState<Map<number, YieldSourceAccount>>(new Map());

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

  useEffect(() => {
    fetchYieldSources();
    const id = setInterval(fetchYieldSources, 15_000);
    return () => clearInterval(id);
  }, [fetchYieldSources]);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <h1 className="mb-2 text-2xl font-bold text-white">Yield Tracking</h1>
        <p className="text-gray-400">
          Connect your wallet to view yield information
        </p>
      </div>
    );
  }

  const loading = protocolLoading || portfolioLoading;

  if (loading && positions.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Yield</h1>

      {error && <ErrorBanner message={error} />}

      <YieldSummaryCard positions={positions} yieldSources={yieldSources} />
      <YieldBreakdownTable positions={positions} yieldSources={yieldSources} />
    </div>
  );
}
