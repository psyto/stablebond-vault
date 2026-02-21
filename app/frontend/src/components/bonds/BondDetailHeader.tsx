"use client";

import type { BondConfig } from "@stablebond/types";
import { BOND_TYPE_LABELS, BOND_CURRENCIES, Tier } from "@stablebond/types";
import { formatAmount } from "@stablebond/sdk";
import { ApyBadge } from "@/components/yield/ApyBadge";
import { TierBadge } from "@/components/shared/TierBadge";
import { bpsToPercent, timestampToDate } from "@/lib/formatters";
import type { BondVault } from "@/hooks/useBondVault";

interface BondDetailHeaderProps {
  bond: BondConfig;
  vault: BondVault | null;
}

export function BondDetailHeader({ bond, vault }: BondDetailHeaderProps) {
  const label = BOND_TYPE_LABELS[bond.bondType] ?? "Custom Bond";
  const currency = BOND_CURRENCIES[bond.bondType] ?? "USD";

  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-2xl font-bold text-white">{label}</h1>
        <span className="rounded bg-surface-2 px-2 py-0.5 text-sm text-gray-300">
          {currency}
        </span>
        <ApyBadge apyBps={vault?.targetApyBps ?? bond.defaultApyBps} />
        <TierBadge tier={bond.minTier as Tier} />
        <span
          className={`ml-auto inline-block h-2.5 w-2.5 rounded-full ${
            bond.isActive ? "bg-accent-green" : "bg-gray-500"
          }`}
        />
      </div>

      <div className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
        <div>
          <p className="text-gray-500">TVL</p>
          <p className="font-mono text-lg text-white">
            {vault ? `$${formatAmount(vault.totalDeposits)}` : "--"}
          </p>
        </div>
        <div>
          <p className="text-gray-500">NAV / Share</p>
          <p className="font-mono text-lg text-white">
            {vault ? formatAmount(vault.navPerShare) : "1.000000"}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Coupon Rate</p>
          <p className="font-mono text-lg text-white">
            {bpsToPercent(bond.couponRateBps)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Maturity</p>
          <p className="text-lg text-white">
            {bond.maturityDate > 0n
              ? timestampToDate(bond.maturityDate)
              : "Perpetual"}
          </p>
        </div>
      </div>
    </div>
  );
}
