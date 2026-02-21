import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

// ─── Program IDs (must match Anchor.toml) ───────────────────────────────────

export const CORE_PROGRAM_ID = new PublicKey(
  "3fnWkVPz51AJjYodQY5VCzteD5enRmkWBTsu3gPedaYs"
);
export const YIELD_PROGRAM_ID = new PublicKey(
  "DLFUfzV4iqCzxmmXmCpR7qH6nhvPSLUekq7JCezV1LeE"
);

// ─── BondType enum values matching Rust ─────────────────────────────────────

export const BondType = {
  UsTBill: { usTBill: {} },
  MxCetes: { mxCetes: {} },
  BrTesouro: { brTesouro: {} },
  JpJgb: { jpJgb: {} },
  Custom: { custom: {} },
} as const;

export const BOND_TYPE_U8 = {
  UsTBill: 0,
  MxCetes: 1,
  BrTesouro: 2,
  JpJgb: 3,
  Custom: 4,
};

// ─── PDA helpers ────────────────────────────────────────────────────────────

export function findProtocolConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablebond_config")],
    programId
  );
}

export function findBondRegistryPda(
  config: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bond_registry"), config.toBuffer()],
    programId
  );
}

export function findYieldSourcePda(
  config: PublicKey,
  tokenMint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("yield_source"), config.toBuffer(), tokenMint.toBuffer()],
    programId
  );
}

export function findUserPositionPda(
  config: PublicKey,
  owner: PublicKey,
  bondType: number,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("user_position"),
      config.toBuffer(),
      owner.toBuffer(),
      Buffer.from([bondType]),
    ],
    programId
  );
}

export function findUsdcVaultPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablebond_usdc_vault")],
    programId
  );
}

export function findBondVaultPda(
  authority: PublicKey,
  bondType: number,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bond_vault"), authority.toBuffer(), Buffer.from([bondType])],
    programId
  );
}

export function findBondShareMintPda(
  authority: PublicKey,
  bondType: number,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("bond_share_mint"),
      authority.toBuffer(),
      Buffer.from([bondType]),
    ],
    programId
  );
}

export function findBondCurrencyVaultPda(
  authority: PublicKey,
  bondType: number,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("bond_currency_vault"),
      authority.toBuffer(),
      Buffer.from([bondType]),
    ],
    programId
  );
}

export function findUserSharesPda(
  vault: PublicKey,
  user: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bond_shares"), vault.toBuffer(), user.toBuffer()],
    programId
  );
}

// ─── Test fixtures ──────────────────────────────────────────────────────────

export interface TestContext {
  provider: anchor.AnchorProvider;
  connection: anchor.web3.Connection;
  authority: Keypair;
  user: Keypair;
  keeper: Keypair;
  usdcMint: PublicKey;
  treasury: Keypair;
}

export async function setupTestContext(
  provider: anchor.AnchorProvider
): Promise<TestContext> {
  const connection = provider.connection;
  const authority = Keypair.generate();
  const user = Keypair.generate();
  const keeper = Keypair.generate();
  const treasury = Keypair.generate();

  // Airdrop SOL to all test accounts
  const accounts = [authority, user, keeper, treasury];
  for (const account of accounts) {
    const sig = await connection.requestAirdrop(
      account.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);
  }

  // Create USDC-like mint (6 decimals)
  const usdcMint = await createMint(
    connection,
    authority,
    authority.publicKey,
    null,
    6
  );

  return { provider, connection, authority, user, keeper, usdcMint, treasury };
}

export async function createAndFundTokenAccount(
  connection: anchor.web3.Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: number
): Promise<PublicKey> {
  const account = await createAccount(connection, payer, mint, owner);
  if (amount > 0) {
    await mintTo(connection, payer, mint, account, payer, amount);
  }
  return account;
}

export async function getTokenBalance(
  connection: anchor.web3.Connection,
  account: PublicKey
): Promise<bigint> {
  const info = await getAccount(connection, account);
  return info.amount;
}

// ─── Common bond configs for testing ────────────────────────────────────────

export function makeUsTBillConfig(
  currencyMint: PublicKey,
  oracleFeed: PublicKey
) {
  return {
    bondType: BondType.UsTBill,
    currencyMint,
    denominationCurrency: [85, 83, 68], // "USD"
    oracleFeed,
    couponRateBps: 450,
    maturityDate: new BN(0), // no maturity
    faceValue: new BN(1_000_000),
    haircutBps: 0,
    defaultApyBps: 450,
    minTier: 1,
    isActive: true,
  };
}

export function makeMxCetesConfig(
  currencyMint: PublicKey,
  oracleFeed: PublicKey
) {
  return {
    bondType: BondType.MxCetes,
    currencyMint,
    denominationCurrency: [77, 88, 78], // "MXN"
    oracleFeed,
    couponRateBps: 900,
    maturityDate: new BN(0),
    faceValue: new BN(10_000_000),
    haircutBps: 200,
    defaultApyBps: 900,
    minTier: 2,
    isActive: true,
  };
}

export function makeJpJgbConfig(
  currencyMint: PublicKey,
  oracleFeed: PublicKey
) {
  return {
    bondType: BondType.JpJgb,
    currencyMint,
    denominationCurrency: [74, 80, 89], // "JPY"
    oracleFeed,
    couponRateBps: 40,
    maturityDate: new BN(0),
    faceValue: new BN(1_000_000),
    haircutBps: 0,
    defaultApyBps: 40,
    minTier: 1,
    isActive: true,
  };
}
