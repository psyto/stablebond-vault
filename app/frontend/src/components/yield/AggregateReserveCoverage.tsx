"use client";

import type { BondVaultExtended } from "@stablebond/sdk";
import { BOND_TYPE_LABELS } from "@stablebond/types";
import { formatAmount } from "@stablebond/sdk";
import { PublicKey } from "@solana/web3.js";

interface AggregateReserveCoverageProps {
  vaults: Map<number, BondVaultExtended>;
}

export function AggregateReserveCoverage({
  vaults,
}: AggregateReserveCoverageProps) {
  const entries = Array.from(vaults.entries()).filter(
    ([, v]) => v.reserveAttestor.toBase58() !== PublicKey.default.toBase58()
  );

  if (entries.length === 0) return null;

  let totalDeposits = 0n;
  let totalReserves = 0n;
  for (const [, v] of entries) {
    totalDeposits += v.totalDeposits;
    totalReserves += v.attestedReserve;
  }

  const overallRatio =
    totalDeposits > 0n
      ? Number((totalReserves * 10_000n) / totalDeposits) / 10_000
      : 1.0;
  const overallPct = (overallRatio * 100).toFixed(1);
  const isFullyBacked = overallRatio >= 1.0;

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Reserve Coverage
      </h2>

      <div className="mb-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-gray-400">Overall backing</span>
          <span
            className={`font-mono font-medium ${
              isFullyBacked ? "text-accent-green" : "text-red-400"
            }`}
          >
            {overallPct}%
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-all ${
              isFullyBacked ? "bg-accent-green" : "bg-red-400"
            }`}
            style={{ width: `${Math.min(parseFloat(overallPct), 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>Reserves: ${formatAmount(totalReserves)}</span>
          <span>Deposits: ${formatAmount(totalDeposits)}</span>
        </div>
      </div>

      <div className="space-y-2">
        {entries.map(([bondType, v]) => {
          const ratio =
            v.totalDeposits > 0n
              ? Number((v.attestedReserve * 10_000n) / v.totalDeposits) / 100
              : 100;
          const now = Math.floor(Date.now() / 1000);
          const staleness = now - Number(v.lastAttestationAt);
          const isStale = staleness > Number(v.attestationMaxStaleness);

          return (
            <div
              key={bondType}
              className="flex items-center justify-between rounded bg-surface-2 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-white">
                  {BOND_TYPE_LABELS[bondType] ?? `Bond ${bondType}`}
                </span>
                {isStale && (
                  <span className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-xs text-yellow-400">
                    stale
                  </span>
                )}
              </div>
              <span
                className={`font-mono ${
                  ratio >= 100 ? "text-accent-green" : "text-red-400"
                }`}
              >
                {ratio.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
