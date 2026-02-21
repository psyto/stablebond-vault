import { PublicKey } from "@solana/web3.js";
import { BondType } from "./bond";

export enum DepositStatus {
  Pending = 0,
  Converting = 1,
  Converted = 2,
  Cancelled = 3,
  Expired = 4,
}

export enum ConversionDirection {
  JpyToUsdc = 0,
  UsdcToJpy = 1,
  MxnToUsdc = 2,
  BrlToUsdc = 3,
  NativeToSettlement = 4,
  SettlementToNative = 5,
}

export const DEPOSIT_STATUS_LABELS: Record<
  DepositStatus,
  { en: string; ja: string }
> = {
  [DepositStatus.Pending]: { en: "Pending", ja: "保留中" },
  [DepositStatus.Converting]: { en: "Converting", ja: "変換中" },
  [DepositStatus.Converted]: { en: "Converted", ja: "変換済み" },
  [DepositStatus.Cancelled]: { en: "Cancelled", ja: "キャンセル" },
  [DepositStatus.Expired]: { en: "Expired", ja: "期限切れ" },
};

export interface PendingDeposit {
  user: PublicKey;
  protocolConfig: PublicKey;
  bondType: BondType;
  sourceAmount: bigint;
  minOutput: bigint;
  depositedAt: bigint;
  expiresAt: bigint;
  status: DepositStatus;
  conversionRate: bigint;
  settlementReceived: bigint;
  feePaid: bigint;
  nonce: bigint;
  bump: number;
}

export interface ConversionRecord {
  user: PublicKey;
  protocolConfig: PublicKey;
  bondType: BondType;
  sourceAmount: bigint;
  settlementAmount: bigint;
  exchangeRate: bigint;
  feeAmount: bigint;
  direction: ConversionDirection;
  timestamp: bigint;
  nonce: bigint;
  bump: number;
}
