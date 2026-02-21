import { PublicKey } from "@solana/web3.js";

export enum BondType {
  UsTBill = 0,
  MxCetes = 1,
  BrTesouro = 2,
  JpJgb = 3,
  Custom = 4,
}

export const BOND_TYPE_LABELS: Record<BondType, string> = {
  [BondType.UsTBill]: "US T-Bill",
  [BondType.MxCetes]: "MX CETES",
  [BondType.BrTesouro]: "BR Tesouro",
  [BondType.JpJgb]: "JP JGB",
  [BondType.Custom]: "Custom",
};

export const BOND_CURRENCIES: Record<BondType, string> = {
  [BondType.UsTBill]: "USD",
  [BondType.MxCetes]: "MXN",
  [BondType.BrTesouro]: "BRL",
  [BondType.JpJgb]: "JPY",
  [BondType.Custom]: "USD",
};

export const BOND_DEFAULT_APY_BPS: Record<BondType, number> = {
  [BondType.UsTBill]: 450,
  [BondType.MxCetes]: 900,
  [BondType.BrTesouro]: 1300,
  [BondType.JpJgb]: 40,
  [BondType.Custom]: 0,
};

export interface BondConfig {
  bondType: BondType;
  currencyMint: PublicKey;
  denominationCurrency: Uint8Array; // 3 bytes
  oracleFeed: PublicKey;
  couponRateBps: number;
  maturityDate: bigint;
  faceValue: bigint;
  haircutBps: number;
  defaultApyBps: number;
  minTier: number;
  isActive: boolean;
}
