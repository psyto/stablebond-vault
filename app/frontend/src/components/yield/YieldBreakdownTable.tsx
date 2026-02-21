"use client";

import type { UserPosition, YieldSourceAccount } from "@stablebond/types";
import { BOND_TYPE_LABELS } from "@stablebond/types";
import {
  sharesToValue,
  unrealizedYield,
  formatAmount,
  projectNav,
} from "@stablebond/sdk";
import { bpsToPercent } from "@/lib/formatters";

interface YieldBreakdownTableProps {
  positions: UserPosition[];
  yieldSources: Map<number, YieldSourceAccount>;
}

export function YieldBreakdownTable({
  positions,
  yieldSources,
}: YieldBreakdownTableProps) {
  if (positions.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-gray-400">No yield data available</p>
      </div>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const oneYearFromNow = now + 31_557_600n;

  return (
    <div className="card overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Yield Breakdown
      </h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-surface-3 text-gray-400">
            <th className="pb-3 pr-4 font-medium">Bond</th>
            <th className="pb-3 pr-4 font-medium">Current Value</th>
            <th className="pb-3 pr-4 font-medium">Unrealized</th>
            <th className="pb-3 pr-4 font-medium">Realized</th>
            <th className="pb-3 pr-4 font-medium">APY</th>
            <th className="pb-3 font-medium">1Y Projection</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const source = yieldSources.get(pos.bondType);
            const nav = source?.navPerShare ?? 1_000_000n;
            const apy = source?.currentApyBps ?? 0;
            const lastAccrual = source?.lastNavUpdate ?? now;
            const maturity = source?.maturityDate ?? 0n;
            const currentValue = sharesToValue(pos.currentShares, nav);
            const unrealized = unrealizedYield(
              pos.currentShares,
              nav,
              pos.costBasis
            );
            const projectedNav = projectNav(
              nav,
              apy,
              lastAccrual,
              oneYearFromNow,
              maturity
            );
            const projectedValue = sharesToValue(
              pos.currentShares,
              projectedNav
            );
            const projectedYield =
              projectedValue > currentValue
                ? projectedValue - currentValue
                : 0n;

            return (
              <tr
                key={pos.bondType}
                className="border-b border-surface-3"
              >
                <td className="py-3 pr-4 font-medium text-white">
                  {BOND_TYPE_LABELS[pos.bondType] ?? "Unknown"}
                </td>
                <td className="py-3 pr-4 font-mono text-white">
                  ${formatAmount(currentValue)}
                </td>
                <td className="py-3 pr-4 font-mono text-accent-green">
                  {unrealized > 0n
                    ? `+$${formatAmount(unrealized)}`
                    : "$0.00"}
                </td>
                <td className="py-3 pr-4 font-mono text-gray-300">
                  ${formatAmount(pos.realizedYield)}
                </td>
                <td className="py-3 pr-4 font-mono text-accent-green">
                  {bpsToPercent(apy)}
                </td>
                <td className="py-3 font-mono text-accent-blue">
                  +${formatAmount(projectedYield)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
