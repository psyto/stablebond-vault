import { BondType, BOND_TYPE_LABELS } from "@stablebond/types";
import {
  Tier,
  TIER_NAMES,
  TIER_BOND_TYPES,
  monthlyLimit,
} from "@stablebond/types";

/** Check whether a tier has access to a given bond type. */
export function isBondTypeAllowed(tier: Tier, bondType: BondType): boolean {
  return TIER_BOND_TYPES[tier]?.includes(bondType) ?? false;
}

/** Get the monthly deposit limit for a (tier, bondType) pair in UI units. */
export function getMonthlyLimitUi(
  tier: Tier,
  bondType: BondType,
  decimals: number = 6
): number {
  const raw = monthlyLimit(tier, bondType);
  if (raw >= BigInt(Number.MAX_SAFE_INTEGER)) return Infinity;
  return Number(raw) / 10 ** decimals;
}

/** Get remaining monthly deposit capacity. */
export function getRemainingCapacity(
  tier: Tier,
  bondType: BondType,
  monthlyDeposited: bigint
): bigint {
  const limit = monthlyLimit(tier, bondType);
  if (limit >= BigInt(Number.MAX_SAFE_INTEGER)) return limit;
  return monthlyDeposited >= limit ? 0n : limit - monthlyDeposited;
}

/** Validate a deposit against tier rules. Returns null if valid, error message otherwise. */
export function validateDeposit(
  tier: Tier,
  bondType: BondType,
  amount: bigint,
  monthlyDeposited: bigint
): string | null {
  if (tier === Tier.Unverified) {
    return "Unverified users cannot deposit. Please complete identity verification.";
  }

  if (!isBondTypeAllowed(tier, bondType)) {
    const tierName = TIER_NAMES[tier]?.en ?? "Unknown";
    const bondName = BOND_TYPE_LABELS[bondType] ?? "Unknown";
    return `${bondName} is not available for ${tierName} tier. Upgrade your tier to access this bond type.`;
  }

  const remaining = getRemainingCapacity(tier, bondType, monthlyDeposited);
  if (remaining !== BigInt(Number.MAX_SAFE_INTEGER) && amount > remaining) {
    return `Deposit exceeds monthly limit. Remaining capacity: ${remaining.toString()} minor units.`;
  }

  return null;
}

/** Get the minimum tier required to access a bond type. */
export function getMinTierForBond(bondType: BondType): Tier {
  for (const tier of [Tier.Bronze, Tier.Silver, Tier.Gold, Tier.Diamond]) {
    if (isBondTypeAllowed(tier, bondType)) return tier;
  }
  return Tier.Diamond;
}
