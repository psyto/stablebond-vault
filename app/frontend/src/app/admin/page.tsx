"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import type { YieldSourceAccount } from "@stablebond/types";
import { useProtocol } from "@/providers/ProtocolProvider";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useStablebondClient } from "@/hooks/useStablebondClient";
import { ProtocolConfigPanel } from "@/components/admin/ProtocolConfigPanel";
import { PauseResumeToggle } from "@/components/admin/PauseResumeToggle";
import { BondRegistryPanel } from "@/components/admin/BondRegistryPanel";
import { YieldSourcePanel } from "@/components/admin/YieldSourcePanel";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { useToast } from "@/components/shared/ToastProvider";

export default function AdminPage() {
  const { connected } = useWallet();
  const isAdmin = useIsAdmin();
  const { config, bonds, loading } = useProtocol();
  const client = useStablebondClient();
  const { addToast } = useToast();

  const [yieldSources, setYieldSources] = useState<YieldSourceAccount[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchYieldSources = useCallback(async () => {
    if (bonds.length === 0) return;
    const sources: YieldSourceAccount[] = [];
    for (const bond of bonds) {
      try {
        const ys = await client.getYieldSource(bond.currencyMint);
        if (ys) sources.push(ys);
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
        <h1 className="mb-2 text-2xl font-bold text-white">Admin Panel</h1>
        <p className="text-gray-400">Connect your wallet to continue</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <h1 className="mb-2 text-2xl font-bold text-white">Access Denied</h1>
        <p className="text-gray-400">
          This page is only accessible to the protocol authority
        </p>
      </div>
    );
  }

  if (!config) {
    return <ErrorBanner message="Failed to load protocol config" />;
  }

  const handleUpdateFees = async (fees: {
    conversionFeeBps: number;
    managementFeeBps: number;
    performanceFeeBps: number;
  }) => {
    setActionLoading(true);
    try {
      // Admin txs call Anchor program directly (not StablebondClient)
      // In production, this would use program.methods.updateProtocolConfig(...)
      addToast("info", "Fee update transaction would be submitted here");
    } catch (e: any) {
      addToast("error", e.message ?? "Failed to update fees");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      addToast("info", "Pause transaction would be submitted here");
    } catch (e: any) {
      addToast("error", e.message ?? "Failed to pause protocol");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      addToast("info", "Resume transaction would be submitted here");
    } catch (e: any) {
      addToast("error", e.message ?? "Failed to resume protocol");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Admin</h1>

      <PauseResumeToggle
        isActive={config.isActive}
        onPause={handlePause}
        onResume={handleResume}
        loading={actionLoading}
      />

      <ProtocolConfigPanel
        config={config}
        onUpdate={handleUpdateFees}
        loading={actionLoading}
      />

      <BondRegistryPanel bonds={bonds} />

      <YieldSourcePanel yieldSources={yieldSources} />
    </div>
  );
}
