export enum YieldSourceType {
  TBill = 0,
  Lending = 1,
  Staking = 2,
  Synthetic = 3,
  SovereignBond = 4,
}

export const YIELD_SOURCE_LABELS: Record<YieldSourceType, string> = {
  [YieldSourceType.TBill]: "T-Bill",
  [YieldSourceType.Lending]: "Lending",
  [YieldSourceType.Staking]: "Staking",
  [YieldSourceType.Synthetic]: "Synthetic",
  [YieldSourceType.SovereignBond]: "Sovereign Bond",
};

export interface YieldCalculation {
  currentValue: bigint;
  costBasis: bigint;
  unrealizedYield: bigint;
  realizedYield: bigint;
  currentApyBps: number;
  projectedAnnualYield: bigint;
}

export interface YieldHistoryPoint {
  timestamp: number;
  navPerShare: number;
  apyBps: number;
  totalValue: number;
}
