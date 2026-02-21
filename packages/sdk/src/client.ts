import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  ProtocolConfig,
  UserPosition,
  YieldSourceAccount,
  PendingDeposit,
  BondConfig,
  BondType,
  BondRegistryAccount,
} from "@stablebond/types";
import {
  findProtocolConfigPda,
  findBondRegistryPda,
  findYieldSourcePda,
  findUserPositionPda,
  findPendingDepositPda,
  findUsdcVaultPda,
  findBondVaultPda,
} from "./pda";

export interface StablebondProgramIds {
  core: PublicKey;
  yield: PublicKey;
}

export class StablebondClient {
  public readonly connection: Connection;
  public readonly provider: AnchorProvider;
  public readonly programIds: StablebondProgramIds;
  private coreProgram: Program | null = null;

  constructor(
    connection: Connection,
    provider: AnchorProvider,
    programIds: StablebondProgramIds
  ) {
    this.connection = connection;
    this.provider = provider;
    this.programIds = programIds;
  }

  // ─── Read Methods ────────────────────────────────────────────────────────────

  get configPda(): PublicKey {
    return findProtocolConfigPda(this.programIds.core)[0];
  }

  async getProtocolConfig(): Promise<ProtocolConfig | null> {
    const info = await this.connection.getAccountInfo(this.configPda);
    if (!info) return null;
    return this.deserializeProtocolConfig(info.data);
  }

  async getSupportedBonds(): Promise<BondConfig[]> {
    const config = await this.getProtocolConfig();
    if (!config) return [];

    const [registryPda] = findBondRegistryPda(
      this.configPda,
      this.programIds.core
    );
    const info = await this.connection.getAccountInfo(registryPda);
    if (!info) return [];

    return this.deserializeBondRegistry(info.data);
  }

  async getYieldSource(
    tokenMint: PublicKey
  ): Promise<YieldSourceAccount | null> {
    const [pda] = findYieldSourcePda(
      this.configPda,
      tokenMint,
      this.programIds.core
    );
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;
    return this.deserializeYieldSource(info.data);
  }

  async getUserPosition(
    owner: PublicKey,
    bondType: BondType
  ): Promise<UserPosition | null> {
    const [pda] = findUserPositionPda(
      this.configPda,
      owner,
      bondType,
      this.programIds.core
    );
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;
    return this.deserializeUserPosition(info.data);
  }

  /** Fetch all UserPositions across all bond types for a user. */
  async getPortfolio(owner: PublicKey): Promise<UserPosition[]> {
    const bonds = await this.getSupportedBonds();
    const positions: UserPosition[] = [];

    for (const bond of bonds) {
      const pos = await this.getUserPosition(owner, bond.bondType);
      if (pos && pos.currentShares > 0n) {
        positions.push(pos);
      }
    }

    return positions;
  }

  async getPendingDeposits(
    user: PublicKey,
    bondType: BondType
  ): Promise<PendingDeposit[]> {
    const position = await this.getUserPosition(user, bondType);
    if (!position) return [];

    const deposits: PendingDeposit[] = [];
    const nonce = position.depositNonce;

    const start = nonce > 20n ? nonce - 20n : 1n;
    for (let i = start; i <= nonce; i++) {
      const [pda] = findPendingDepositPda(
        this.configPda,
        user,
        i,
        this.programIds.core
      );
      const info = await this.connection.getAccountInfo(pda);
      if (info) {
        const deposit = this.deserializePendingDeposit(info.data);
        if (deposit) deposits.push(deposit);
      }
    }

    return deposits;
  }

  async getBondVault(bondType: BondType): Promise<any | null> {
    const config = await this.getProtocolConfig();
    if (!config) return null;

    const [vaultPda] = findBondVaultPda(
      config.authority,
      bondType,
      this.programIds.yield
    );
    const info = await this.connection.getAccountInfo(vaultPda);
    if (!info) return null;

    return this.deserializeBondVault(info.data);
  }

  // ─── Transaction Methods ─────────────────────────────────────────────────────

  async depositDirect(
    amount: BN,
    bondType: BondType,
    accounts: {
      yieldSourceMint: PublicKey;
      userToken: PublicKey;
      depositVault: PublicKey;
      whitelistEntry: PublicKey;
      sovereignIdentity: PublicKey;
    }
  ): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [yieldSourcePda] = findYieldSourcePda(
      this.configPda,
      accounts.yieldSourceMint,
      this.programIds.core
    );
    const [userPositionPda] = findUserPositionPda(
      this.configPda,
      user,
      bondType,
      this.programIds.core
    );

    const program = this.getCoreProgram();
    const tx = await program.methods
      .depositDirect(amount, { [BondType[bondType].charAt(0).toLowerCase() + BondType[bondType].slice(1)]: {} })
      .accounts({
        user,
        protocolConfig: this.configPda,
        yieldSource: yieldSourcePda,
        userToken: accounts.userToken,
        depositVault: accounts.depositVault,
        userPosition: userPositionPda,
        whitelistEntry: accounts.whitelistEntry,
        sovereignIdentity: accounts.sovereignIdentity,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  async withdraw(
    shares: BN,
    bondType: BondType,
    accounts: {
      yieldSourceMint: PublicKey;
      depositVault: PublicKey;
      userToken: PublicKey;
    }
  ): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [yieldSourcePda] = findYieldSourcePda(
      this.configPda,
      accounts.yieldSourceMint,
      this.programIds.core
    );
    const [userPositionPda] = findUserPositionPda(
      this.configPda,
      user,
      bondType,
      this.programIds.core
    );

    const program = this.getCoreProgram();
    const tx = await program.methods
      .withdraw(shares, { [BondType[bondType].charAt(0).toLowerCase() + BondType[bondType].slice(1)]: {} })
      .accounts({
        user,
        protocolConfig: this.configPda,
        yieldSource: yieldSourcePda,
        userPosition: userPositionPda,
        depositVault: accounts.depositVault,
        userToken: accounts.userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  async claimYield(
    bondType: BondType,
    accounts: {
      yieldSourceMint: PublicKey;
      depositVault: PublicKey;
      userToken: PublicKey;
    }
  ): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [yieldSourcePda] = findYieldSourcePda(
      this.configPda,
      accounts.yieldSourceMint,
      this.programIds.core
    );
    const [userPositionPda] = findUserPositionPda(
      this.configPda,
      user,
      bondType,
      this.programIds.core
    );

    const program = this.getCoreProgram();
    const tx = await program.methods
      .claimYield({ [BondType[bondType].charAt(0).toLowerCase() + BondType[bondType].slice(1)]: {} })
      .accounts({
        user,
        protocolConfig: this.configPda,
        yieldSource: yieldSourcePda,
        userPosition: userPositionPda,
        depositVault: accounts.depositVault,
        userToken: accounts.userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private getCoreProgram(): Program {
    if (!this.coreProgram) {
      throw new Error(
        "Program not initialized — load IDL via StablebondClient.withProgram()"
      );
    }
    return this.coreProgram;
  }

  /** Attach a loaded Anchor Program instance. */
  withProgram(program: Program): StablebondClient {
    this.coreProgram = program;
    return this;
  }

  // ─── Deserialization helpers ──────────────────────────────────────────────────

  private deserializeProtocolConfig(data: Buffer): ProtocolConfig {
    let offset = 8; // skip discriminator
    const authority = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const treasury = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const usdcMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const usdcVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const kycRegistry = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const sovereignProgram = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const bondRegistry = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const conversionFeeBps = data.readUInt16LE(offset);
    offset += 2;
    const managementFeeBps = data.readUInt16LE(offset);
    offset += 2;
    const performanceFeeBps = data.readUInt16LE(offset);
    offset += 2;
    const totalDeposits = data.readBigUInt64LE(offset);
    offset += 8;
    const totalYieldEarned = data.readBigUInt64LE(offset);
    offset += 8;
    const pendingConversion = data.readBigUInt64LE(offset);
    offset += 8;
    const depositNonce = data.readBigUInt64LE(offset);
    offset += 8;
    const numSupportedBonds = data[offset];
    offset += 1;
    const isActive = data[offset] !== 0;
    offset += 1;
    const createdAt = data.readBigInt64LE(offset);
    offset += 8;
    const updatedAt = data.readBigInt64LE(offset);
    offset += 8;
    const bump = data[offset];
    offset += 1;
    const usdcVaultBump = data[offset];

    return {
      authority,
      treasury,
      usdcMint,
      usdcVault,
      kycRegistry,
      sovereignProgram,
      bondRegistry,
      conversionFeeBps,
      managementFeeBps,
      performanceFeeBps,
      totalDeposits,
      totalYieldEarned,
      pendingConversion,
      depositNonce,
      numSupportedBonds,
      isActive,
      createdAt,
      updatedAt,
      bump,
      usdcVaultBump,
    };
  }

  private deserializeBondRegistry(data: Buffer): BondConfig[] {
    // Skip discriminator(8) + protocol_config(32) + vec_len(4)
    let offset = 8 + 32;
    const vecLen = data.readUInt32LE(offset);
    offset += 4;

    const bonds: BondConfig[] = [];
    for (let i = 0; i < vecLen; i++) {
      const bondType = data[offset] as BondType;
      offset += 1;
      const currencyMint = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;
      const denominationCurrency = new Uint8Array(
        data.subarray(offset, offset + 3)
      );
      offset += 3;
      const oracleFeed = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;
      const couponRateBps = data.readUInt16LE(offset);
      offset += 2;
      const maturityDate = data.readBigInt64LE(offset);
      offset += 8;
      const faceValue = data.readBigUInt64LE(offset);
      offset += 8;
      const haircutBps = data.readUInt16LE(offset);
      offset += 2;
      const defaultApyBps = data.readUInt16LE(offset);
      offset += 2;
      const minTier = data[offset];
      offset += 1;
      const isActive = data[offset] !== 0;
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

  private deserializeYieldSource(data: Buffer): YieldSourceAccount {
    let offset = 8;
    const protocolConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const name = new Uint8Array(data.subarray(offset, offset + 32));
    offset += 32;
    const sourceType = data[offset];
    offset += 1;
    const tokenMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const depositVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const yieldTokenVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const currentApyBps = data.readUInt16LE(offset);
    offset += 2;
    const totalDeposited = data.readBigUInt64LE(offset);
    offset += 8;
    const totalShares = data.readBigUInt64LE(offset);
    offset += 8;
    const allocationWeightBps = data.readUInt16LE(offset);
    offset += 2;
    const minDeposit = data.readBigUInt64LE(offset);
    offset += 8;
    const maxAllocation = data.readBigUInt64LE(offset);
    offset += 8;
    const isActive = data[offset] !== 0;
    offset += 1;
    const lastNavUpdate = data.readBigInt64LE(offset);
    offset += 8;
    const navPerShare = data.readBigUInt64LE(offset);
    offset += 8;
    const bondType = data[offset] as BondType;
    offset += 1;
    const currencyMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const oracleFeed = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const couponRateBps = data.readUInt16LE(offset);
    offset += 2;
    const maturityDate = data.readBigInt64LE(offset);
    offset += 8;
    const haircutBps = data.readUInt16LE(offset);
    offset += 2;
    const bump = data[offset];

    return {
      protocolConfig,
      name,
      sourceType,
      tokenMint,
      depositVault,
      yieldTokenVault,
      currentApyBps,
      totalDeposited,
      totalShares,
      allocationWeightBps,
      minDeposit,
      maxAllocation,
      isActive,
      lastNavUpdate,
      navPerShare,
      bondType,
      currencyMint,
      oracleFeed,
      couponRateBps,
      maturityDate,
      haircutBps,
      bump,
    };
  }

  private deserializeUserPosition(data: Buffer): UserPosition {
    let offset = 8;
    const owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const protocolConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const bondType = data[offset] as BondType;
    offset += 1;
    const totalDeposited = data.readBigUInt64LE(offset);
    offset += 8;
    const currentShares = data.readBigUInt64LE(offset);
    offset += 8;
    const costBasis = data.readBigUInt64LE(offset);
    offset += 8;
    const realizedYield = data.readBigUInt64LE(offset);
    offset += 8;
    const sovereignTier = data[offset];
    offset += 1;
    const monthlyDeposited = data.readBigUInt64LE(offset);
    offset += 8;
    const monthStart = data.readBigInt64LE(offset);
    offset += 8;
    const depositCount = data.readUInt32LE(offset);
    offset += 4;
    const withdrawalCount = data.readUInt32LE(offset);
    offset += 4;
    const lastDepositAt = data.readBigInt64LE(offset);
    offset += 8;
    const lastWithdrawalAt = data.readBigInt64LE(offset);
    offset += 8;
    const depositNonce = data.readBigUInt64LE(offset);
    offset += 8;
    const createdAt = data.readBigInt64LE(offset);
    offset += 8;
    const bump = data[offset];

    return {
      owner,
      protocolConfig,
      bondType,
      totalDeposited,
      currentShares,
      costBasis,
      realizedYield,
      sovereignTier,
      monthlyDeposited,
      monthStart,
      depositCount,
      withdrawalCount,
      lastDepositAt,
      lastWithdrawalAt,
      depositNonce,
      createdAt,
      bump,
    };
  }

  private deserializePendingDeposit(data: Buffer): PendingDeposit {
    let offset = 8;
    const user = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const protocolConfig = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const bondType = data[offset] as BondType;
    offset += 1;
    const sourceAmount = data.readBigUInt64LE(offset);
    offset += 8;
    const minOutput = data.readBigUInt64LE(offset);
    offset += 8;
    const depositedAt = data.readBigInt64LE(offset);
    offset += 8;
    const expiresAt = data.readBigInt64LE(offset);
    offset += 8;
    const status = data[offset];
    offset += 1;
    const conversionRate = data.readBigUInt64LE(offset);
    offset += 8;
    const settlementReceived = data.readBigUInt64LE(offset);
    offset += 8;
    const feePaid = data.readBigUInt64LE(offset);
    offset += 8;
    const nonce = data.readBigUInt64LE(offset);
    offset += 8;
    const bump = data[offset];

    return {
      user,
      protocolConfig,
      bondType,
      sourceAmount,
      minOutput,
      depositedAt,
      expiresAt,
      status,
      conversionRate,
      settlementReceived,
      feePaid,
      nonce,
      bump,
    };
  }

  private deserializeBondVault(data: Buffer): any {
    let offset = 8;
    const authority = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const currencyMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const shareMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const currencyVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const bondType = data[offset] as BondType;
    offset += 1;
    const couponRateBps = data.readUInt16LE(offset);
    offset += 2;
    const maturityDate = data.readBigInt64LE(offset);
    offset += 8;
    const targetApyBps = data.readUInt16LE(offset);
    offset += 2;
    const totalDeposits = data.readBigUInt64LE(offset);
    offset += 8;
    const totalShares = data.readBigUInt64LE(offset);
    offset += 8;
    const navPerShare = data.readBigUInt64LE(offset);
    offset += 8;
    const lastAccrual = data.readBigInt64LE(offset);
    offset += 8;
    const isActive = data[offset] !== 0;

    return {
      authority,
      currencyMint,
      shareMint,
      currencyVault,
      bondType,
      couponRateBps,
      maturityDate,
      targetApyBps,
      totalDeposits,
      totalShares,
      navPerShare,
      lastAccrual,
      isActive,
    };
  }
}
