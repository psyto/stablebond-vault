import { PublicKey } from "@solana/web3.js";

// ─── stablebond-core PDAs ───────────────────────────────────────────────────────

export function findProtocolConfigPda(
  programId: PublicKey
): [PublicKey, number] {
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

export function findPendingDepositPda(
  config: PublicKey,
  user: PublicKey,
  nonce: bigint,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pending_deposit"),
      config.toBuffer(),
      user.toBuffer(),
      nonceBuffer,
    ],
    programId
  );
}

export function findConversionRecordPda(
  config: PublicKey,
  user: PublicKey,
  nonce: bigint,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("conversion"),
      config.toBuffer(),
      user.toBuffer(),
      nonceBuffer,
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

// ─── stablebond-yield PDAs ──────────────────────────────────────────────────────

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

export function findBondSharesPda(
  vault: PublicKey,
  user: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bond_shares"), vault.toBuffer(), user.toBuffer()],
    programId
  );
}
