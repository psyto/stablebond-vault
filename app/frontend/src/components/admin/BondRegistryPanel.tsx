"use client";

import type { BondConfig } from "@stablebond/types";
import { BOND_TYPE_LABELS, BOND_CURRENCIES, Tier } from "@stablebond/types";
import { bpsToPercent, timestampToDate } from "@/lib/formatters";
import { TierBadge } from "@/components/shared/TierBadge";

interface BondRegistryPanelProps {
  bonds: BondConfig[];
}

export function BondRegistryPanel({ bonds }: BondRegistryPanelProps) {
  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-white">Bond Registry</h2>

      {bonds.length === 0 ? (
        <p className="text-gray-400">No bonds registered</p>
      ) : (
        <div className="space-y-3">
          {bonds.map((bond) => (
            <div
              key={bond.bondType}
              className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    bond.isActive ? "bg-accent-green" : "bg-gray-500"
                  }`}
                />
                <span className="font-medium text-white">
                  {BOND_TYPE_LABELS[bond.bondType] ?? "Custom"}
                </span>
                <span className="text-sm text-gray-400">
                  {BOND_CURRENCIES[bond.bondType] ?? "USD"}
                </span>
                <TierBadge tier={bond.minTier as Tier} />
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <span>APY: {bpsToPercent(bond.defaultApyBps)}</span>
                <span>
                  Maturity:{" "}
                  {bond.maturityDate > 0n
                    ? timestampToDate(bond.maturityDate)
                    : "Perpetual"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
