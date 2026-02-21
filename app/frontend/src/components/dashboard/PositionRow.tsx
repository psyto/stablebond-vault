"use client";

import Link from "next/link";
import type { UserPosition, YieldSourceAccount } from "@stablebond/types";
import {
  BOND_TYPE_LABELS,
  BOND_CURRENCIES,
  Tier,
} from "@stablebond/types";
import { sharesToValue, unrealizedYield, formatAmount } from "@stablebond/sdk";
import { TierBadge } from "@/components/shared/TierBadge";
import { bpsToPercent } from "@/lib/formatters";

interface PositionRowProps {
  position: UserPosition;
  yieldSource: YieldSourceAccount | undefined;
}

export function PositionRow({ position, yieldSource }: PositionRowProps) {
  const nav = yieldSource?.navPerShare ?? 1_000_000n;
  const currentValue = sharesToValue(position.currentShares, nav);
  const unrealized = unrealizedYield(position.currentShares, nav, position.costBasis);
  const currency = BOND_CURRENCIES[position.bondType] ?? "USD";
  const apy = yieldSource?.currentApyBps ?? 0;

  return (
    <tr className="border-b border-surface-3 transition-colors hover:bg-surface-2/50">
      <td className="py-4 pr-4">
        <Link
          href={`/bonds/${position.bondType}`}
          className="font-medium text-white hover:text-accent-blue"
        >
          {BOND_TYPE_LABELS[position.bondType] ?? "Unknown"}
        </Link>
        <span className="ml-2 text-xs text-gray-500">{currency}</span>
      </td>
      <td className="py-4 pr-4">
        <TierBadge tier={position.sovereignTier as Tier} />
      </td>
      <td className="py-4 pr-4 font-mono text-white">
        ${formatAmount(currentValue)}
      </td>
      <td className="py-4 pr-4 font-mono text-accent-green">
        {unrealized > 0n ? `+$${formatAmount(unrealized)}` : "$0.00"}
      </td>
      <td className="py-4 pr-4 font-mono text-gray-300">
        {bpsToPercent(apy)}
      </td>
      <td className="py-4">
        <Link
          href={`/bonds/${position.bondType}`}
          className="text-sm text-accent-blue hover:underline"
        >
          Manage
        </Link>
      </td>
    </tr>
  );
}
