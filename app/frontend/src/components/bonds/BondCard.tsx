"use client";

import Link from "next/link";
import type { BondConfig } from "@stablebond/types";
import { BOND_TYPE_LABELS, BOND_CURRENCIES, Tier } from "@stablebond/types";
import { formatAmount } from "@stablebond/sdk";
import { ApyBadge } from "@/components/yield/ApyBadge";
import { TierBadge } from "@/components/shared/TierBadge";
import { timestampToDate, bpsToPercent } from "@/lib/formatters";

interface BondCardProps {
  bond: BondConfig;
  tvl?: bigint;
  navPerShare?: bigint;
}

export function BondCard({ bond, tvl, navPerShare }: BondCardProps) {
  const label = BOND_TYPE_LABELS[bond.bondType] ?? "Custom Bond";
  const currency = BOND_CURRENCIES[bond.bondType] ?? "USD";

  return (
    <Link href={`/bonds/${bond.bondType}`} className="card group transition-all hover:border-accent-blue/50">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white group-hover:text-accent-blue">
          {label}
        </h3>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            bond.isActive ? "bg-accent-green" : "bg-gray-500"
          }`}
        />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-gray-300">
          {currency}
        </span>
        <ApyBadge apyBps={bond.defaultApyBps} />
        <TierBadge tier={bond.minTier as Tier} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500">TVL</p>
          <p className="font-mono text-white">
            {tvl != null ? `$${formatAmount(tvl)}` : "--"}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Coupon Rate</p>
          <p className="font-mono text-white">
            {bpsToPercent(bond.couponRateBps)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Maturity</p>
          <p className="text-white">
            {bond.maturityDate > 0n
              ? timestampToDate(bond.maturityDate)
              : "Perpetual"}
          </p>
        </div>
        <div>
          <p className="text-gray-500">NAV/Share</p>
          <p className="font-mono text-white">
            {navPerShare != null ? formatAmount(navPerShare) : "1.00"}
          </p>
        </div>
      </div>
    </Link>
  );
}
