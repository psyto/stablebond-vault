"use client";

import type { BondVaultExtended } from "@stablebond/sdk";
import { verifyReserveCoverage } from "@stablebond/sdk";
import { PublicKey } from "@solana/web3.js";

interface ReserveCoverageIndicatorProps {
  vault: BondVaultExtended;
}

export function ReserveCoverageIndicator({
  vault,
}: ReserveCoverageIndicatorProps) {
  const hasAttestor =
    vault.reserveAttestor.toBase58() !== PublicKey.default.toBase58();

  if (!hasAttestor) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-gray-500">
        <span className="h-2 w-2 rounded-full bg-gray-600" />
        No reserve attestor
      </div>
    );
  }

  const { ratio, isFullyBacked } = verifyReserveCoverage(
    vault.attestedReserve,
    vault.totalDeposits
  );

  const now = Math.floor(Date.now() / 1000);
  const staleness = now - Number(vault.lastAttestationAt);
  const isStale = staleness > Number(vault.attestationMaxStaleness);
  const pct = (ratio * 100).toFixed(1);

  return (
    <div className="card">
      <h4 className="mb-3 text-sm font-medium text-gray-400">
        Reserve Coverage
      </h4>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-400">Backing ratio</span>
            <span
              className={`font-mono font-medium ${
                isFullyBacked ? "text-accent-green" : "text-red-400"
              }`}
            >
              {pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full transition-all ${
                isFullyBacked ? "bg-accent-green" : "bg-red-400"
              }`}
              style={{ width: `${Math.min(Number(pct), 100)}%` }}
            />
          </div>
        </div>
      </div>
      {isStale && (
        <p className="mt-2 text-xs text-yellow-400">
          Attestation stale ({Math.floor(staleness / 60)}m ago) - yield accrual
          paused
        </p>
      )}
      {!isStale && vault.lastAttestationAt > 0n && (
        <p className="mt-2 text-xs text-gray-500">
          Last attested {Math.floor(staleness / 60)}m ago
        </p>
      )}
    </div>
  );
}
