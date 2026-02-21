"use client";

import type { UserPosition, YieldSourceAccount } from "@stablebond/types";
import { sharesToValue, unrealizedYield, formatAmount } from "@stablebond/sdk";
import { StatCard } from "@/components/shared/StatCard";

interface PortfolioSummaryProps {
  positions: UserPosition[];
  yieldSources: Map<number, YieldSourceAccount>;
}

export function PortfolioSummary({
  positions,
  yieldSources,
}: PortfolioSummaryProps) {
  let totalValue = 0n;
  let totalUnrealized = 0n;
  let totalRealized = 0n;

  for (const pos of positions) {
    const source = yieldSources.get(pos.bondType);
    const nav = source?.navPerShare ?? 1_000_000n;
    totalValue += sharesToValue(pos.currentShares, nav);
    totalUnrealized += unrealizedYield(pos.currentShares, nav, pos.costBasis);
    totalRealized += pos.realizedYield;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Value"
        value={`$${formatAmount(totalValue)}`}
      />
      <StatCard
        label="Unrealized Yield"
        value={`$${formatAmount(totalUnrealized)}`}
        trend={totalUnrealized > 0n ? "up" : "neutral"}
        subValue={totalUnrealized > 0n ? `+$${formatAmount(totalUnrealized)}` : undefined}
      />
      <StatCard
        label="Realized Yield"
        value={`$${formatAmount(totalRealized)}`}
        trend={totalRealized > 0n ? "up" : "neutral"}
      />
      <StatCard label="Positions" value={positions.length.toString()} />
    </div>
  );
}
