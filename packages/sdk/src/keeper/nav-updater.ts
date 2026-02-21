import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BondType, BondConfig } from "@stablebond/types";
import {
  findProtocolConfigPda,
  findBondRegistryPda,
  findYieldSourcePda,
  findBondVaultPda,
  findBondShareMintPda,
  findBondCurrencyVaultPda,
} from "../pda";

/**
 * NavUpdater is a keeper bot that iterates over all active bond vaults,
 * calls accrueYield on each vault, and then updates NAV on the core program.
 * Generalized from the Exodus single-vault NavUpdater to support multi-bond.
 */
export class NavUpdater {
  private connection: Connection;
  private coreProgram: Program;
  private yieldProgram: Program;
  private keeper: Keypair;
  private coreProgramId: PublicKey;
  private yieldProgramId: PublicKey;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    connection: Connection,
    coreProgram: Program,
    yieldProgram: Program,
    keeper: Keypair,
    coreProgramId: PublicKey,
    yieldProgramId: PublicKey
  ) {
    this.connection = connection;
    this.coreProgram = coreProgram;
    this.yieldProgram = yieldProgram;
    this.keeper = keeper;
    this.coreProgramId = coreProgramId;
    this.yieldProgramId = yieldProgramId;
  }

  /**
   * Start the periodic NAV update loop.
   * @param pollIntervalMs - How often to crank, in milliseconds (default: 60s)
   */
  async start(pollIntervalMs: number = 60_000): Promise<void> {
    console.log(
      `[NavUpdater] Starting with poll interval ${pollIntervalMs}ms`
    );
    console.log(`[NavUpdater] Keeper: ${this.keeper.publicKey.toBase58()}`);
    console.log(
      `[NavUpdater] Core program: ${this.coreProgramId.toBase58()}`
    );
    console.log(
      `[NavUpdater] Yield program: ${this.yieldProgramId.toBase58()}`
    );

    await this.updateAll();

    this.interval = setInterval(async () => {
      try {
        await this.updateAll();
      } catch (err) {
        console.error("[NavUpdater] Error during update:", err);
      }
    }, pollIntervalMs);
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[NavUpdater] Stopped");
    }
  }

  /**
   * Iterate over all registered bonds. For each active bond vault:
   * 1. Accrue yield on the stablebond-yield vault
   * 2. Update NAV on the stablebond-core yield source
   */
  private async updateAll(): Promise<void> {
    const bonds = await this.getRegisteredBonds();

    for (const bond of bonds) {
      if (!bond.isActive) continue;

      try {
        await this.accrueYield(bond);
        await this.updateNav(bond);
      } catch (err) {
        console.error(
          `[NavUpdater] Failed to update ${BondType[bond.bondType]}:`,
          err
        );
      }
    }
  }

  /**
   * Call accrueYield on the stablebond-yield program for a specific bond vault.
   */
  private async accrueYield(bond: BondConfig): Promise<void> {
    const [configPda] = findProtocolConfigPda(this.coreProgramId);
    const configInfo = await this.connection.getAccountInfo(configPda);
    if (!configInfo) {
      console.warn("[NavUpdater] Protocol config not found, skipping");
      return;
    }
    // Parse authority from config (offset: 8 discriminator + 0 = authority at byte 8)
    const authority = new PublicKey(configInfo.data.subarray(8, 40));

    const [bondVaultPda] = findBondVaultPda(
      authority,
      bond.bondType,
      this.yieldProgramId
    );
    const [shareMintPda] = findBondShareMintPda(
      authority,
      bond.bondType,
      this.yieldProgramId
    );
    const [currencyVaultPda] = findBondCurrencyVaultPda(
      authority,
      bond.bondType,
      this.yieldProgramId
    );

    const tx = await this.yieldProgram.methods
      .accrueYield()
      .accounts({
        keeper: this.keeper.publicKey,
        vault: bondVaultPda,
        shareMint: shareMintPda,
        currencyVault: currencyVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.keeper])
      .rpc();

    console.log(
      `[NavUpdater] Yield accrued for ${BondType[bond.bondType]}: ${tx}`
    );
  }

  /**
   * Call updateNav on the stablebond-core program for a specific yield source.
   */
  private async updateNav(bond: BondConfig): Promise<void> {
    const [configPda] = findProtocolConfigPda(this.coreProgramId);
    const configInfo = await this.connection.getAccountInfo(configPda);
    if (!configInfo) {
      console.warn("[NavUpdater] Protocol config not found, skipping");
      return;
    }
    const authority = new PublicKey(configInfo.data.subarray(8, 40));

    const [yieldSourcePda] = findYieldSourcePda(
      configPda,
      bond.currencyMint,
      this.coreProgramId
    );

    const yieldSourceInfo =
      await this.connection.getAccountInfo(yieldSourcePda);
    if (!yieldSourceInfo) {
      console.warn(
        `[NavUpdater] Yield source not found for ${BondType[bond.bondType]}, skipping`
      );
      return;
    }

    const [bondVaultPda] = findBondVaultPda(
      authority,
      bond.bondType,
      this.yieldProgramId
    );

    const tx = await this.coreProgram.methods
      .updateNav()
      .accounts({
        keeper: this.keeper.publicKey,
        protocolConfig: configPda,
        yieldSource: yieldSourcePda,
        bondVault: bondVaultPda,
        bondVaultProgram: this.yieldProgramId,
      })
      .signers([this.keeper])
      .rpc();

    console.log(
      `[NavUpdater] NAV updated for ${BondType[bond.bondType]}: ${tx}`
    );
  }

  /** Read the BondRegistry to get all registered bond configs. */
  private async getRegisteredBonds(): Promise<BondConfig[]> {
    const [configPda] = findProtocolConfigPda(this.coreProgramId);
    const [registryPda] = findBondRegistryPda(
      configPda,
      this.coreProgramId
    );

    const info = await this.connection.getAccountInfo(registryPda);
    if (!info) return [];

    // Deserialize BondRegistry: skip discriminator(8) + protocol_config(32), read vec
    let offset = 8 + 32;
    const vecLen = info.data.readUInt32LE(offset);
    offset += 4;

    const bonds: BondConfig[] = [];
    for (let i = 0; i < vecLen; i++) {
      const bondType = info.data[offset] as BondType;
      offset += 1;
      const currencyMint = new PublicKey(
        info.data.subarray(offset, offset + 32)
      );
      offset += 32;
      const denominationCurrency = new Uint8Array(
        info.data.subarray(offset, offset + 3)
      );
      offset += 3;
      const oracleFeed = new PublicKey(
        info.data.subarray(offset, offset + 32)
      );
      offset += 32;
      const couponRateBps = info.data.readUInt16LE(offset);
      offset += 2;
      const maturityDate = info.data.readBigInt64LE(offset);
      offset += 8;
      const faceValue = info.data.readBigUInt64LE(offset);
      offset += 8;
      const haircutBps = info.data.readUInt16LE(offset);
      offset += 2;
      const defaultApyBps = info.data.readUInt16LE(offset);
      offset += 2;
      const minTier = info.data[offset];
      offset += 1;
      const isActive = info.data[offset] !== 0;
      offset += 1;

      bonds.push({
        bondType,
        currencyMint,
        denominationCurrency,
        oracleFeed,
        couponRateBps,
        maturityDate,
        faceValue,
        haircutBps,
        defaultApyBps,
        minTier,
        isActive,
      });
    }

    return bonds;
  }
}
