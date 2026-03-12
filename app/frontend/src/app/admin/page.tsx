"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { YieldSourceAccount } from "@stablebond/types";
import type { BondVaultExtended } from "@stablebond/sdk";
import { useProtocol } from "@/providers/ProtocolProvider";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useStablebondClient } from "@/hooks/useStablebondClient";
import { ProtocolConfigPanel } from "@/components/admin/ProtocolConfigPanel";
import { PauseResumeToggle } from "@/components/admin/PauseResumeToggle";
import { BondRegistryPanel } from "@/components/admin/BondRegistryPanel";
import { YieldSourcePanel } from "@/components/admin/YieldSourcePanel";
import { VaultOraclePanel } from "@/components/admin/VaultOraclePanel";
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
  const [vaultsExtended, setVaultsExtended] = useState<Map<number, BondVaultExtended>>(new Map());
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (bonds.length === 0) return;
    const sources: YieldSourceAccount[] = [];
    const vExt = new Map<number, BondVaultExtended>();
    for (const bond of bonds) {
      try {
        const ys = await client.getYieldSource(bond.currencyMint);
        if (ys) sources.push(ys);
        const ext = await client.getBondVaultExtended(bond.bondType);
        if (ext) vExt.set(bond.bondType, ext);
      } catch {}
    }
    setYieldSources(sources);
    setVaultsExtended(vExt);
  }, [client, bonds]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15_000);
    return () => clearInterval(id);
  }, [fetchData]);

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

  const handleConfigureOracle = async (
    bondType: number,
    oracleFeed: string,
    enabled: boolean
  ) => {
    setActionLoading(true);
    try {
      addToast(
        "info",
        `Oracle ${enabled ? "enabled" : "disabled"} for bond type ${bondType} — submit tx via program.methods.configureOracle()`
      );
      await fetchData();
    } catch (e: any) {
      addToast("error", e.message ?? "Failed to configure oracle");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfigureAttestor = async (
    bondType: number,
    attestor: string,
    maxStaleness: number
  ) => {
    setActionLoading(true);
    try {
      addToast(
        "info",
        `Attestor configured for bond type ${bondType} — submit tx via program.methods.configureReserveAttestor()`
      );
      await fetchData();
    } catch (e: any) {
      addToast("error", e.message ?? "Failed to configure attestor");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetImmediateWithdraw = async (
    bondType: number,
    allow: boolean
  ) => {
    setActionLoading(true);
    try {
      addToast(
        "info",
        `Immediate withdraw ${allow ? "enabled" : "disabled"} for bond type ${bondType} — submit tx via program.methods.setImmediateWithdraw()`
      );
      await fetchData();
    } catch (e: any) {
      addToast("error", e.message ?? "Failed to toggle immediate withdraw");
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

      <VaultOraclePanel
        bonds={bonds}
        vaults={vaultsExtended}
        onConfigureOracle={handleConfigureOracle}
        onConfigureAttestor={handleConfigureAttestor}
        onSetImmediateWithdraw={handleSetImmediateWithdraw}
        loading={actionLoading}
      />

      <BondRegistryPanel bonds={bonds} />

      <YieldSourcePanel yieldSources={yieldSources} />
    </div>
  );
}
