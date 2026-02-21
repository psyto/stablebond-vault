import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BondType } from "@stablebond/types";
import {
  findProtocolConfigPda,
  findBondRegistryPda,
  findConversionRecordPda,
  findUserPositionPda,
  findUsdcVaultPda,
  findYieldSourcePda,
} from "../pda";

/**
 * ConversionBot watches for PendingDeposit accounts with status=Pending
 * and calls executeConversion on them. This is a multi-bond generalization
 * of the Exodus single-currency conversion bot — it handles all bond types
 * and their respective oracle feeds.
 */
export class ConversionBot {
  private connection: Connection;
  private program: Program;
  private keeper: Keypair;
  private programId: PublicKey;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    connection: Connection,
    program: Program,
    keeper: Keypair,
    programId: PublicKey
  ) {
    this.connection = connection;
    this.program = program;
    this.keeper = keeper;
    this.programId = programId;
  }

  /**
   * Start polling for pending deposits across all bond types.
   * @param pollIntervalMs - How often to scan, in milliseconds (default: 10s)
   */
  async start(pollIntervalMs: number = 10_000): Promise<void> {
    console.log(
      `[ConversionBot] Starting with poll interval ${pollIntervalMs}ms`
    );
    console.log(`[ConversionBot] Keeper: ${this.keeper.publicKey.toBase58()}`);
    console.log(`[ConversionBot] Program: ${this.programId.toBase58()}`);

    await this.scanAndConvert();

    this.interval = setInterval(async () => {
      try {
        await this.scanAndConvert();
      } catch (err) {
        console.error("[ConversionBot] Error during scan:", err);
      }
    }, pollIntervalMs);
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[ConversionBot] Stopped");
    }
  }

  /**
   * Scan for all PendingDeposit accounts with status=Pending (byte value 0)
   * and attempt to execute the conversion for each one.
   *
   * Account layout (stablebond PendingDeposit):
   *   discriminator(8) + user(32) + protocolConfig(32) + bondType(1) +
   *   sourceAmount(8) + minOutput(8) + depositedAt(8) + expiresAt(8) +
   *   status(1) ...
   *   Status offset = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 = 105
   */
  private async scanAndConvert(): Promise<void> {
    const STATUS_OFFSET = 105;

    const pendingAccounts = await this.connection.getProgramAccounts(
      this.programId,
      {
        filters: [
          {
            memcmp: {
              offset: STATUS_OFFSET,
              bytes: "1", // base58 encoding of byte 0x00 (Pending status)
            },
          },
        ],
      }
    );

    if (pendingAccounts.length === 0) {
      return;
    }

    console.log(
      `[ConversionBot] Found ${pendingAccounts.length} pending deposit(s)`
    );

    for (const { pubkey, account } of pendingAccounts) {
      try {
        await this.executeConversion(pubkey, account.data);
      } catch (err) {
        console.error(
          `[ConversionBot] Failed to convert deposit ${pubkey.toBase58()}:`,
          err
        );
      }
    }
  }

  /**
   * Execute a single conversion for a pending deposit.
   * Reads bond_type from the account to determine which oracle feed and
   * yield source to use.
   */
  private async executeConversion(
    pendingDepositPda: PublicKey,
    data: Buffer
  ): Promise<void> {
    // Parse fields from account data
    const user = new PublicKey(data.subarray(8, 40));
    const protocolConfig = new PublicKey(data.subarray(40, 72));
    const bondType = data[72] as BondType;

    // nonce is at: status(1) + conversionRate(8) + settlementReceived(8) + feePaid(8) = 25 bytes after status
    // status offset = 105
    const nonceOffset = 105 + 1 + 8 + 8 + 8;
    const depositNonce = data.readBigUInt64LE(nonceOffset);

    const [configPda] = findProtocolConfigPda(this.programId);
    const [userPositionPda] = findUserPositionPda(
      configPda,
      user,
      bondType,
      this.programId
    );
    const [conversionRecordPda] = findConversionRecordPda(
      configPda,
      user,
      depositNonce,
      this.programId
    );
    const [usdcVault] = findUsdcVaultPda(this.programId);

    // Read yield source for this bond type's oracle feed
    const configInfo = await this.connection.getAccountInfo(configPda);
    if (!configInfo) {
      console.warn("[ConversionBot] Protocol config not found, skipping");
      return;
    }

    console.log(
      `[ConversionBot] Executing conversion for deposit ${pendingDepositPda.toBase58()} ` +
        `(user=${user.toBase58()}, bondType=${BondType[bondType]}, nonce=${depositNonce})`
    );

    const tx = await this.program.methods
      .executeConversion()
      .accounts({
        keeper: this.keeper.publicKey,
        protocolConfig: configPda,
        pendingDeposit: pendingDepositPda,
        userPosition: userPositionPda,
        conversionRecord: conversionRecordPda,
        user,
        usdcVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.keeper])
      .rpc();

    console.log(
      `[ConversionBot] Conversion executed: ${tx} ` +
        `(deposit=${pendingDepositPda.toBase58()}, bondType=${BondType[bondType]})`
    );
  }
}
