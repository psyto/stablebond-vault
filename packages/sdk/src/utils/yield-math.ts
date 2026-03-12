/** NAV scale factor — all nav_per_share values use 6 decimal precision. */
export const NAV_SCALE = 1_000_000n;

/** Seconds in a standard year (365.25 days). */
export const SECONDS_PER_YEAR = 31_557_600n;

/** Convert shares to underlying value using current NAV per share. */
export function sharesToValue(shares: bigint, navPerShare: bigint): bigint {
  return (shares * navPerShare) / NAV_SCALE;
}

/** Convert underlying value to shares using current NAV per share. */
export function valueToShares(value: bigint, navPerShare: bigint): bigint {
  if (navPerShare === 0n) return 0n;
  return (value * NAV_SCALE) / navPerShare;
}

/** Calculate unrealized yield for a position. */
export function unrealizedYield(
  shares: bigint,
  navPerShare: bigint,
  costBasis: bigint
): bigint {
  const currentValue = sharesToValue(shares, navPerShare);
  return currentValue > costBasis ? currentValue - costBasis : 0n;
}

/** Calculate total position value (cost basis + unrealized yield + realized yield). */
export function totalPositionValue(
  shares: bigint,
  navPerShare: bigint,
  realizedYield: bigint
): bigint {
  return sharesToValue(shares, navPerShare) + realizedYield;
}

/**
 * Estimate yield accrual over a time period.
 * Uses the same formula as the on-chain vault:
 *   accrual = navPerShare * apyBps * elapsedSeconds / (10000 * SECONDS_PER_YEAR)
 */
export function estimateAccrual(
  navPerShare: bigint,
  apyBps: number,
  elapsedSeconds: bigint
): bigint {
  return (
    (navPerShare * BigInt(apyBps) * elapsedSeconds) /
    (10_000n * SECONDS_PER_YEAR)
  );
}

/**
 * Project NAV per share at a future timestamp.
 * Accounts for bond maturity — no accrual after maturity date.
 */
export function projectNav(
  currentNav: bigint,
  apyBps: number,
  lastAccrual: bigint,
  targetTimestamp: bigint,
  maturityDate: bigint = 0n
): bigint {
  let end = targetTimestamp;
  if (maturityDate > 0n && end > maturityDate) {
    end = maturityDate;
  }
  if (end <= lastAccrual) return currentNav;

  const elapsed = end - lastAccrual;
  const accrual = estimateAccrual(currentNav, apyBps, elapsed);
  return currentNav + accrual;
}

/** Calculate effective APY given two NAV snapshots over a time period. */
export function effectiveApy(
  navStart: bigint,
  navEnd: bigint,
  elapsedSeconds: bigint
): number {
  if (navStart === 0n || elapsedSeconds === 0n) return 0;
  const growth = Number(navEnd - navStart) / Number(navStart);
  const annualized = growth * (Number(SECONDS_PER_YEAR) / Number(elapsedSeconds));
  return annualized * 10_000; // return in bps
}

/** Calculate performance fee on yield. */
export function performanceFee(
  yieldAmount: bigint,
  performanceFeeBps: number
): bigint {
  return (yieldAmount * BigInt(performanceFeeBps)) / 10_000n;
}

/** Format a minor-unit amount to a human-readable string. */
export function formatAmount(
  amount: bigint,
  decimals: number = 6,
  maxFractionDigits: number = 2
): string {
  const divisor = 10 ** decimals;
  const whole = amount / BigInt(divisor);
  const frac = amount % BigInt(divisor);
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFractionDigits);
  return `${whole.toString()}.${fracStr}`;
}

/**
 * Derive effective APY from a bond oracle price relative to par.
 * Mirrors the on-chain oracle-based yield derivation in accrue_yield.
 *
 * @param bondPrice - Bond price scaled 1e6 (e.g. 990000 = 0.99, 1005000 = 1.005)
 * @param couponRateBps - Bond coupon rate in basis points
 * @returns Effective yield in basis points
 */
export function oracleDerivedApyBps(
  bondPrice: bigint,
  couponRateBps: number
): number {
  if (bondPrice === 0n) return 0;

  if (bondPrice < NAV_SCALE) {
    // Discount bond: yield = (par - price) / price * 10000 + coupon
    const discountYield = Number((NAV_SCALE - bondPrice) * 10_000n / bondPrice);
    return discountYield + couponRateBps;
  } else if (bondPrice > NAV_SCALE) {
    // Premium bond: yield = coupon - premium amortization
    const premiumCost = Number((bondPrice - NAV_SCALE) * 10_000n / bondPrice);
    return Math.max(0, couponRateBps - premiumCost);
  } else {
    return couponRateBps;
  }
}

/**
 * Estimate oracle-aware accrual using a bond price feed.
 * Combines oracle price derivation with time-based accrual.
 */
export function estimateOracleAccrual(
  navPerShare: bigint,
  bondPrice: bigint,
  couponRateBps: number,
  elapsedSeconds: bigint
): bigint {
  const effectiveBps = oracleDerivedApyBps(bondPrice, couponRateBps);
  const cappedBps = Math.min(effectiveBps, 5000);
  return estimateAccrual(navPerShare, cappedBps, elapsedSeconds);
}

/**
 * Withdrawal cooldown period in seconds per bond type.
 * Mirrors the on-chain withdrawal_cooldown_seconds() function.
 */
export enum BondTypeEnum {
  UsTBill = 0,
  MxCetes = 1,
  BrTesouro = 2,
  JpJgb = 3,
  Custom = 4,
}

export function withdrawalCooldownSeconds(bondType: BondTypeEnum): number {
  switch (bondType) {
    case BondTypeEnum.UsTBill: return 86_400;      // T+1
    case BondTypeEnum.MxCetes: return 172_800;     // T+2
    case BondTypeEnum.BrTesouro: return 172_800;   // T+2
    case BondTypeEnum.JpJgb: return 172_800;       // T+2
    case BondTypeEnum.Custom: return 86_400;       // T+1
    default: return 86_400;
  }
}
