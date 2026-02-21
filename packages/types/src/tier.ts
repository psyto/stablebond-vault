import { BondType } from "./bond";
import { YieldSourceType } from "./yield";

export enum Tier {
  Unverified = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Diamond = 4,
}

export const TIER_NAMES: Record<Tier, { en: string; ja: string }> = {
  [Tier.Unverified]: { en: "Unverified", ja: "未認証" },
  [Tier.Bronze]: { en: "Bronze", ja: "ブロンズ" },
  [Tier.Silver]: { en: "Silver", ja: "シルバー" },
  [Tier.Gold]: { en: "Gold", ja: "ゴールド" },
  [Tier.Diamond]: { en: "Diamond", ja: "ダイヤモンド" },
};

export const TIER_COLORS: Record<Tier, string> = {
  [Tier.Unverified]: "#6B7280",
  [Tier.Bronze]: "#CD7F32",
  [Tier.Silver]: "#C0C0C0",
  [Tier.Gold]: "#FFD700",
  [Tier.Diamond]: "#B9F2FF",
};

/** Monthly deposit limits by tier and bond type (minor units, 6 decimals). */
export function monthlyLimit(tier: Tier, bondType: BondType): bigint {
  const limits: Record<string, bigint> = {
    // US T-Bills (USD)
    [`${Tier.Bronze}-${BondType.UsTBill}`]: 5_000_000_000n,
    [`${Tier.Silver}-${BondType.UsTBill}`]: 50_000_000_000n,
    [`${Tier.Gold}-${BondType.UsTBill}`]: 500_000_000_000n,
    [`${Tier.Diamond}-${BondType.UsTBill}`]: BigInt(Number.MAX_SAFE_INTEGER),
    // MX CETES (MXN)
    [`${Tier.Bronze}-${BondType.MxCetes}`]: 100_000_000_000n,
    [`${Tier.Silver}-${BondType.MxCetes}`]: 1_000_000_000_000n,
    [`${Tier.Gold}-${BondType.MxCetes}`]: 10_000_000_000_000n,
    [`${Tier.Diamond}-${BondType.MxCetes}`]: BigInt(Number.MAX_SAFE_INTEGER),
    // BR Tesouro (BRL)
    [`${Tier.Bronze}-${BondType.BrTesouro}`]: 25_000_000_000n,
    [`${Tier.Silver}-${BondType.BrTesouro}`]: 250_000_000_000n,
    [`${Tier.Gold}-${BondType.BrTesouro}`]: 2_500_000_000_000n,
    [`${Tier.Diamond}-${BondType.BrTesouro}`]: BigInt(Number.MAX_SAFE_INTEGER),
    // JP JGBs (JPY)
    [`${Tier.Bronze}-${BondType.JpJgb}`]: 500_000_000_000n,
    [`${Tier.Silver}-${BondType.JpJgb}`]: 5_000_000_000_000n,
    [`${Tier.Gold}-${BondType.JpJgb}`]: 50_000_000_000_000n,
    [`${Tier.Diamond}-${BondType.JpJgb}`]: BigInt(Number.MAX_SAFE_INTEGER),
  };
  return limits[`${tier}-${bondType}`] ?? 0n;
}

/** Bond types allowed per tier. */
export const TIER_BOND_TYPES: Record<Tier, BondType[]> = {
  [Tier.Unverified]: [],
  [Tier.Bronze]: [BondType.UsTBill, BondType.JpJgb],
  [Tier.Silver]: [BondType.UsTBill, BondType.JpJgb, BondType.MxCetes],
  [Tier.Gold]: [
    BondType.UsTBill,
    BondType.JpJgb,
    BondType.MxCetes,
    BondType.BrTesouro,
  ],
  [Tier.Diamond]: [
    BondType.UsTBill,
    BondType.JpJgb,
    BondType.MxCetes,
    BondType.BrTesouro,
    BondType.Custom,
  ],
};

/** Yield source types allowed per tier. */
export const TIER_YIELD_SOURCES: Record<Tier, YieldSourceType[]> = {
  [Tier.Unverified]: [],
  [Tier.Bronze]: [YieldSourceType.TBill, YieldSourceType.SovereignBond],
  [Tier.Silver]: [
    YieldSourceType.TBill,
    YieldSourceType.Lending,
    YieldSourceType.SovereignBond,
  ],
  [Tier.Gold]: [
    YieldSourceType.TBill,
    YieldSourceType.Lending,
    YieldSourceType.Staking,
    YieldSourceType.SovereignBond,
  ],
  [Tier.Diamond]: [
    YieldSourceType.TBill,
    YieldSourceType.Lending,
    YieldSourceType.Staking,
    YieldSourceType.Synthetic,
    YieldSourceType.SovereignBond,
  ],
};

export interface TierInfo {
  tier: Tier;
  allowedBondTypes: BondType[];
  allowedSources: YieldSourceType[];
}
