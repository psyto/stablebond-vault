import { PublicKey } from "@solana/web3.js";
import { BondType } from "./bond";

export interface ProtocolConfig {
  authority: PublicKey;
  treasury: PublicKey;
  usdcMint: PublicKey;
  usdcVault: PublicKey;
  kycRegistry: PublicKey;
  sovereignProgram: PublicKey;
  bondRegistry: PublicKey;
  conversionFeeBps: number;
  managementFeeBps: number;
  performanceFeeBps: number;
  totalDeposits: bigint;
  totalYieldEarned: bigint;
  pendingConversion: bigint;
  depositNonce: bigint;
  numSupportedBonds: number;
  isActive: boolean;
  createdAt: bigint;
  updatedAt: bigint;
  bump: number;
  usdcVaultBump: number;
}

export interface YieldSourceAccount {
  protocolConfig: PublicKey;
  name: Uint8Array;
  sourceType: number;
  tokenMint: PublicKey;
  depositVault: PublicKey;
  yieldTokenVault: PublicKey;
  currentApyBps: number;
  totalDeposited: bigint;
  totalShares: bigint;
  allocationWeightBps: number;
  minDeposit: bigint;
  maxAllocation: bigint;
  isActive: boolean;
  lastNavUpdate: bigint;
  navPerShare: bigint;
  bondType: BondType;
  currencyMint: PublicKey;
  oracleFeed: PublicKey;
  couponRateBps: number;
  maturityDate: bigint;
  haircutBps: number;
  bump: number;
}

export interface UserPosition {
  owner: PublicKey;
  protocolConfig: PublicKey;
  bondType: BondType;
  totalDeposited: bigint;
  currentShares: bigint;
  costBasis: bigint;
  realizedYield: bigint;
  sovereignTier: number;
  monthlyDeposited: bigint;
  monthStart: bigint;
  depositCount: number;
  withdrawalCount: number;
  lastDepositAt: bigint;
  lastWithdrawalAt: bigint;
  depositNonce: bigint;
  createdAt: bigint;
  bump: number;
}

export interface BondRegistryAccount {
  protocolConfig: PublicKey;
  bonds: import("./bond").BondConfig[];
  bump: number;
}
