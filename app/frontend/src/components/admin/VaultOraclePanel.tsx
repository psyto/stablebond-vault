"use client";

import { useState } from "react";
import type { BondConfig } from "@stablebond/types";
import { BOND_TYPE_LABELS } from "@stablebond/types";
import type { BondVaultExtended } from "@stablebond/sdk";
import { PublicKey } from "@solana/web3.js";
import { shortenAddress } from "@/lib/formatters";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface VaultOraclePanelProps {
  bonds: BondConfig[];
  vaults: Map<number, BondVaultExtended>;
  onConfigureOracle: (
    bondType: number,
    oracleFeed: string,
    enabled: boolean
  ) => Promise<void>;
  onConfigureAttestor: (
    bondType: number,
    attestor: string,
    maxStaleness: number
  ) => Promise<void>;
  onSetImmediateWithdraw: (
    bondType: number,
    allow: boolean
  ) => Promise<void>;
  loading: boolean;
}

export function VaultOraclePanel({
  bonds,
  vaults,
  onConfigureOracle,
  onConfigureAttestor,
  onSetImmediateWithdraw,
  loading,
}: VaultOraclePanelProps) {
  const [oracleFeed, setOracleFeed] = useState("");
  const [attestorKey, setAttestorKey] = useState("");
  const [maxStaleness, setMaxStaleness] = useState("3600");
  const [selectedBond, setSelectedBond] = useState<number | null>(null);

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Oracle & Reserve Configuration
      </h2>

      <div className="space-y-4">
        {bonds.map((bond) => {
          const vault = vaults.get(bond.bondType);
          const label = BOND_TYPE_LABELS[bond.bondType] ?? `Bond ${bond.bondType}`;
          const isExpanded = selectedBond === bond.bondType;

          return (
            <div key={bond.bondType} className="rounded-lg bg-surface-2 p-4">
              <button
                onClick={() =>
                  setSelectedBond(isExpanded ? null : bond.bondType)
                }
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        vault?.oracleEnabled ? "bg-blue-400" : "bg-gray-600"
                      }`}
                      title={vault?.oracleEnabled ? "Oracle active" : "Manual APY"}
                    />
                    <span className="text-xs text-gray-500">
                      {vault?.oracleEnabled ? "Oracle" : "Manual"}
                    </span>
                  </div>
                  {vault && vault.reserveAttestor.toBase58() !== PublicKey.default.toBase58() && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          vault.attestedReserve >= vault.totalDeposits
                            ? "bg-accent-green"
                            : "bg-red-400"
                        }`}
                      />
                      <span className="text-xs text-gray-500">PoR</span>
                    </div>
                  )}
                  {vault && (
                    <span className="text-xs text-gray-500">
                      Immediate withdraw: {vault.allowImmediateWithdraw ? "ON" : "OFF"}
                    </span>
                  )}
                </div>
                <span className="text-gray-400">{isExpanded ? "-" : "+"}</span>
              </button>

              {isExpanded && vault && (
                <div className="mt-4 space-y-4 border-t border-surface-3 pt-4">
                  {/* Current state */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Oracle Feed</p>
                      <p className="font-mono text-xs text-white">
                        {vault.oracleFeed.toBase58() !== PublicKey.default.toBase58()
                          ? shortenAddress(vault.oracleFeed.toBase58(), 8)
                          : "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Reserve Attestor</p>
                      <p className="font-mono text-xs text-white">
                        {vault.reserveAttestor.toBase58() !== PublicKey.default.toBase58()
                          ? shortenAddress(vault.reserveAttestor.toBase58(), 8)
                          : "Not set"}
                      </p>
                    </div>
                  </div>

                  {/* Configure Oracle */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">
                      Oracle Feed Address
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={oracleFeed}
                        onChange={(e) => setOracleFeed(e.target.value)}
                        placeholder="Pyth/Switchboard feed pubkey"
                        className="flex-1 rounded bg-surface-3 px-3 py-2 text-sm text-white placeholder-gray-600"
                      />
                      <button
                        onClick={() =>
                          onConfigureOracle(bond.bondType, oracleFeed, true)
                        }
                        disabled={loading || !oracleFeed}
                        className="btn-primary px-3 py-2 text-sm"
                      >
                        {loading ? <LoadingSpinner className="h-4 w-4" /> : "Enable"}
                      </button>
                      <button
                        onClick={() =>
                          onConfigureOracle(
                            bond.bondType,
                            PublicKey.default.toBase58(),
                            false
                          )
                        }
                        disabled={loading}
                        className="btn-ghost px-3 py-2 text-sm"
                      >
                        Disable
                      </button>
                    </div>
                  </div>

                  {/* Configure Attestor */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">
                      Reserve Attestor
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={attestorKey}
                        onChange={(e) => setAttestorKey(e.target.value)}
                        placeholder="Attestor pubkey"
                        className="flex-1 rounded bg-surface-3 px-3 py-2 text-sm text-white placeholder-gray-600"
                      />
                      <input
                        type="number"
                        value={maxStaleness}
                        onChange={(e) => setMaxStaleness(e.target.value)}
                        placeholder="Max staleness (s)"
                        className="w-24 rounded bg-surface-3 px-3 py-2 text-sm text-white placeholder-gray-600"
                      />
                      <button
                        onClick={() =>
                          onConfigureAttestor(
                            bond.bondType,
                            attestorKey,
                            parseInt(maxStaleness)
                          )
                        }
                        disabled={loading || !attestorKey}
                        className="btn-primary px-3 py-2 text-sm"
                      >
                        {loading ? <LoadingSpinner className="h-4 w-4" /> : "Set"}
                      </button>
                    </div>
                  </div>

                  {/* Toggle immediate withdraw */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">
                      Legacy Immediate Withdraw
                    </span>
                    <button
                      onClick={() =>
                        onSetImmediateWithdraw(
                          bond.bondType,
                          !vault.allowImmediateWithdraw
                        )
                      }
                      disabled={loading}
                      className={`rounded px-4 py-1.5 text-sm font-medium ${
                        vault.allowImmediateWithdraw
                          ? "bg-red-900/30 text-red-400 hover:bg-red-900/50"
                          : "bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
                      }`}
                    >
                      {vault.allowImmediateWithdraw ? "Disable" : "Enable (Emergency)"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
