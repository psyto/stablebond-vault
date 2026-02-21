"use client";

import Link from "next/link";
import type { BondConfig } from "@stablebond/types";
import { BOND_TYPE_LABELS, BOND_CURRENCIES, Tier } from "@stablebond/types";
import { formatAmount } from "@stablebond/sdk";
import { bpsToPercent } from "@/lib/formatters";
import { TierBadge } from "@/components/shared/TierBadge";
import type { BondVault } from "@/hooks/useBondVault";

interface BondComparisonTableProps {
  bonds: BondConfig[];
  vaults: Map<number, BondVault>;
}

export function BondComparisonTable({
  bonds,
  vaults,
}: BondComparisonTableProps) {
  return (
    <div className="card overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Bond Comparison
      </h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-surface-3 text-gray-400">
            <th className="pb-3 pr-4 font-medium">Bond</th>
            <th className="pb-3 pr-4 font-medium">Currency</th>
            <th className="pb-3 pr-4 font-medium">APY</th>
            <th className="pb-3 pr-4 font-medium">TVL</th>
            <th className="pb-3 pr-4 font-medium">Min Tier</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {bonds.map((bond) => {
            const vault = vaults.get(bond.bondType);
            return (
              <tr
                key={bond.bondType}
                className="border-b border-surface-3 transition-colors hover:bg-surface-2/50"
              >
                <td className="py-3 pr-4 font-medium text-white">
                  {BOND_TYPE_LABELS[bond.bondType] ?? "Custom"}
                </td>
                <td className="py-3 pr-4 text-gray-300">
                  {BOND_CURRENCIES[bond.bondType] ?? "USD"}
                </td>
                <td className="py-3 pr-4 font-mono text-accent-green">
                  {bpsToPercent(vault?.targetApyBps ?? bond.defaultApyBps)}
                </td>
                <td className="py-3 pr-4 font-mono text-white">
                  {vault ? `$${formatAmount(vault.totalDeposits)}` : "--"}
                </td>
                <td className="py-3 pr-4">
                  <TierBadge tier={bond.minTier as Tier} />
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`text-xs ${
                      bond.isActive ? "text-accent-green" : "text-gray-500"
                    }`}
                  >
                    {bond.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-3">
                  <Link
                    href={`/bonds/${bond.bondType}`}
                    className="text-sm text-accent-blue hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
