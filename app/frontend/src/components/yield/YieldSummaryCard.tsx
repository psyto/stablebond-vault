"use client";

import type { UserPosition, YieldSourceAccount } from "@stablebond/types";
import { unrealizedYield, formatAmount } from "@stablebond/sdk";
import { StatCard } from "@/components/shared/StatCard";

interface YieldSummaryCardProps {
  positions: UserPosition[];
  yieldSources: Map<number, YieldSourceAccount>;
}

export function YieldSummaryCard({
  positions,
  yieldSources,
}: YieldSummaryCardProps) {
  let totalUnrealized = 0n;
  let totalRealized = 0n;

  for (const pos of positions) {
    const source = yieldSources.get(pos.bondType);
    const nav = source?.navPerShare ?? 1_000_000n;
    totalUnrealized += unrealizedYield(pos.currentShares, nav, pos.costBasis);
    totalRealized += pos.realizedYield;
  }

  const totalYield = totalRealized + totalUnrealized;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Total Yield"
        value={`$${formatAmount(totalYield)}`}
        trend={totalYield > 0n ? "up" : "neutral"}
      />
      <StatCard
        label="Unrealized"
        value={`$${formatAmount(totalUnrealized)}`}
        trend={totalUnrealized > 0n ? "up" : "neutral"}
        subValue="Mark-to-market"
      />
      <StatCard
        label="Realized"
        value={`$${formatAmount(totalRealized)}`}
        trend={totalRealized > 0n ? "up" : "neutral"}
        subValue="Claimed"
      />
    </div>
  );
}
