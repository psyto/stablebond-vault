"use client";

import { useEffect, useState, useCallback } from "react";
import { useProtocol } from "@/providers/ProtocolProvider";
import { useStablebondClient } from "@/hooks/useStablebondClient";
import { BondCard } from "@/components/bonds/BondCard";
import { BondComparisonTable } from "@/components/bonds/BondComparisonTable";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import type { BondVault } from "@/hooks/useBondVault";
import type { BondVaultExtended } from "@stablebond/sdk";

export default function BondExplorerPage() {
  const { bonds, loading, error } = useProtocol();
  const client = useStablebondClient();
  const [vaults, setVaults] = useState<Map<number, BondVault>>(new Map());
  const [vaultsExtended, setVaultsExtended] = useState<Map<number, BondVaultExtended>>(new Map());

  const fetchVaults = useCallback(async () => {
    if (bonds.length === 0) return;
    const v = new Map<number, BondVault>();
    const vExt = new Map<number, BondVaultExtended>();
    for (const bond of bonds) {
      try {
        const vault = await client.getBondVault(bond.bondType);
        if (vault) v.set(bond.bondType, vault);
        const ext = await client.getBondVaultExtended(bond.bondType);
        if (ext) vExt.set(bond.bondType, ext);
      } catch {}
    }
    setVaults(v);
    setVaultsExtended(vExt);
  }, [client, bonds]);

  useEffect(() => {
    fetchVaults();
    const id = setInterval(fetchVaults, 30_000);
    return () => clearInterval(id);
  }, [fetchVaults]);

  if (loading && bonds.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Bond Explorer</h1>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bonds.map((bond) => {
          const vault = vaults.get(bond.bondType);
          const ext = vaultsExtended.get(bond.bondType);
          return (
            <BondCard
              key={bond.bondType}
              bond={bond}
              tvl={vault?.totalDeposits}
              navPerShare={vault?.navPerShare}
              vaultExtended={ext}
            />
          );
        })}
      </div>

      {bonds.length > 1 && (
        <BondComparisonTable bonds={bonds} vaults={vaults} />
      )}
    </div>
  );
}
