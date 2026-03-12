import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BondType } from "@stablebond/types";
import {
  findProtocolConfigPda,
  findBondVaultPda,
} from "../pda";

// ─── Well-known Pyth devnet feed addresses (placeholders) ────────────────────

export const PYTH_FEEDS = {
  // These are placeholder devnet feed addresses - replace with actual Pyth feeds
  US_TBILL: Keypair.generate().publicKey,
  MX_CETES: Keypair.generate().publicKey,
  BR_TESOURO: Keypair.generate().publicKey,
  JP_JGB: Keypair.generate().publicKey,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface OracleConfig {
  feedAddress: PublicKey;
  couponRateBps: number;
}

interface OraclePrice {
  price: bigint;
  lastUpdateTime: number;
}

/**
 * OracleBridge bridges real-world bond price data from Pyth/Switchboard
 * oracle feeds to configure the on-chain oracle accounts for each bond vault.
 */
export class OracleBridge {
  private connection: Connection;
  private yieldProgram: Program;
  private authorityKeypair: Keypair;
  private yieldProgramId: PublicKey;
  private oracleConfig: Map<BondType, OracleConfig>;

  constructor(
    connection: Connection,
    yieldProgram: Program,
    authorityKeypair: Keypair,
    yieldProgramId: PublicKey,
    oracleConfig: Map<BondType, OracleConfig>
  ) {
    this.connection = connection;
    this.yieldProgram = yieldProgram;
    this.authorityKeypair = authorityKeypair;
    this.yieldProgramId = yieldProgramId;
    this.oracleConfig = oracleConfig;
  }

  /**
   * Configure oracle feeds for all bond types in the oracle config.
   */
  async configureAllOracles(): Promise<void> {
    for (const [bondType, config] of this.oracleConfig.entries()) {
      try {
        await this.configureBondOracle(bondType, config.feedAddress);
      } catch (err) {
        console.error(
          `[OracleBridge] Failed to configure oracle for bond type ${bondType}:`,
          err
        );
      }
    }
  }

  /**
   * Configure the oracle feed for a specific bond type on-chain.
   * Calls the configureOracle instruction with the given feed address.
   */
  async configureBondOracle(
    bondType: BondType,
    oracleFeed: PublicKey
  ): Promise<void> {
    // Read authority from ProtocolConfig account
    // Layout: discriminator(8) + authority(32)
    const [configPda] = findProtocolConfigPda(this.yieldProgramId);
    const configInfo = await this.connection.getAccountInfo(configPda);
    if (!configInfo) {
      console.warn(
        "[OracleBridge] Protocol config not found, skipping oracle configuration"
      );
      return;
    }
    const authority = new PublicKey(configInfo.data.subarray(8, 40));

    const [bondVaultPda] = findBondVaultPda(
      authority,
      bondType,
      this.yieldProgramId
    );

    const tx = await this.yieldProgram.methods
      .configureOracle(oracleFeed, true)
      .accounts({
        authority: this.authorityKeypair.publicKey,
        vaultConfig: bondVaultPda,
      })
      .signers([this.authorityKeypair])
      .rpc();

    console.log(
      `[OracleBridge] Oracle configured for bond type ${bondType}: ${tx} ` +
        `(feed=${oracleFeed.toBase58()})`
    );
  }

  /**
   * Verify that the oracle feed for a given bond type is fresh (not stale).
   * An oracle is considered fresh if its last update was within 300 seconds.
   * @returns true if the oracle is fresh, false if stale or not found.
   */
  async verifyOracleFreshness(bondType: BondType): Promise<boolean> {
    const config = this.oracleConfig.get(bondType);
    if (!config) {
      console.warn(
        `[OracleBridge] No oracle config found for bond type ${bondType}`
      );
      return false;
    }

    try {
      const price = await this.readOraclePrice(config.feedAddress);
      const now = Math.floor(Date.now() / 1000);
      const staleness = now - price.lastUpdateTime;
      const isFresh = staleness < 300;

      if (!isFresh) {
        console.warn(
          `[OracleBridge] Oracle for bond type ${bondType} is stale: ` +
            `last update ${staleness}s ago (threshold: 300s)`
        );
      }

      return isFresh;
    } catch (err) {
      console.error(
        `[OracleBridge] Failed to read oracle for bond type ${bondType}:`,
        err
      );
      return false;
    }
  }

  /**
   * Read the current price from an oracle account.
   *
   * Oracle account layout:
   *   discriminator(8) + authority(32) + current_price(u64, 8) + last_update_time(i64, 8)
   *
   * @param oracleAddress - The public key of the oracle account.
   * @returns The oracle price and last update timestamp.
   */
  async readOraclePrice(oracleAddress: PublicKey): Promise<OraclePrice> {
    const accountInfo = await this.connection.getAccountInfo(oracleAddress);
    if (!accountInfo) {
      throw new Error(
        `[OracleBridge] Oracle account not found: ${oracleAddress.toBase58()}`
      );
    }

    const data = accountInfo.data;

    // current_price at offset 40 (after discriminator 8 + authority 32)
    const price = data.readBigUInt64LE(40);

    // last_update_time at offset 48 (after current_price 8)
    const lastUpdateTime = Number(data.readBigInt64LE(48));

    return { price, lastUpdateTime };
  }
}
