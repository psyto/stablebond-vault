import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BondType, BondConfig } from "@stablebond/types";
import {
  findProtocolConfigPda,
  findBondRegistryPda,
  findBondVaultPda,
} from "../pda";

interface CustodianReserve {
  holdings: bigint;
  timestamp: number;
}

/**
 * ReserveAttestor is a keeper service that periodically reads off-chain
 * custodian data and submits reserve attestations to the BondVault on-chain.
 * This provides proof-of-reserve transparency for each bond vault.
 */
export class ReserveAttestor {
  private connection: Connection;
  private yieldProgram: Program;
  private attestorKeypair: Keypair;
  private yieldProgramId: PublicKey;
  private custodianEndpoints: Map<BondType, string>;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    connection: Connection,
    yieldProgram: Program,
    attestorKeypair: Keypair,
    yieldProgramId: PublicKey,
    custodianEndpoints: Map<BondType, string>
  ) {
    this.connection = connection;
    this.yieldProgram = yieldProgram;
    this.attestorKeypair = attestorKeypair;
    this.yieldProgramId = yieldProgramId;
    this.custodianEndpoints = custodianEndpoints;
  }

  /**
   * Start the periodic reserve attestation loop.
   * @param pollIntervalMs - How often to attest, in milliseconds (default: 1 hour)
   */
  async start(pollIntervalMs: number = 3600_000): Promise<void> {
    console.log(
      `[ReserveAttestor] Starting with poll interval ${pollIntervalMs}ms`
    );
    console.log(
      `[ReserveAttestor] Attestor: ${this.attestorKeypair.publicKey.toBase58()}`
    );
    console.log(
      `[ReserveAttestor] Yield program: ${this.yieldProgramId.toBase58()}`
    );

    await this.attestAll();

    this.interval = setInterval(async () => {
      try {
        await this.attestAll();
      } catch (err) {
        console.error("[ReserveAttestor] Error during attestation:", err);
      }
    }, pollIntervalMs);
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[ReserveAttestor] Stopped");
    }
  }

  /**
   * Iterate over all custodian endpoints, fetch reserve data,
   * and submit attestations on-chain.
   */
  async attestAll(): Promise<void> {
    for (const [bondType, endpoint] of this.custodianEndpoints.entries()) {
      try {
        await this.attestBond(bondType, endpoint);
      } catch (err) {
        console.error(
          `[ReserveAttestor] Failed to attest bond type ${bondType}:`,
          err
        );
      }
    }
  }

  /**
   * Fetch the reserve from the custodian API and submit an on-chain attestation.
   */
  async attestBond(bondType: BondType, endpoint: string): Promise<void> {
    const reserve = await this.fetchCustodianReserve(endpoint);

    console.log(
      `[ReserveAttestor] Fetched reserve for bond type ${bondType}: ` +
        `holdings=${reserve.holdings}, timestamp=${reserve.timestamp}`
    );

    // Read authority from ProtocolConfig account
    // Layout: discriminator(8) + authority(32)
    const [configPda] = findProtocolConfigPda(this.yieldProgramId);
    const configInfo = await this.connection.getAccountInfo(configPda);
    if (!configInfo) {
      console.warn(
        "[ReserveAttestor] Protocol config not found, skipping attestation"
      );
      return;
    }
    const authority = new PublicKey(configInfo.data.subarray(8, 40));

    const [bondVaultPda] = findBondVaultPda(
      authority,
      bondType,
      this.yieldProgramId
    );

    // Convert holdings to minor units (6 decimal places)
    const attestedReserve = new BN(reserve.holdings.toString()).mul(
      new BN(1_000_000)
    );

    const tx = await this.yieldProgram.methods
      .submitReserveAttestation(attestedReserve)
      .accounts({
        attestor: this.attestorKeypair.publicKey,
        vaultConfig: bondVaultPda,
      })
      .signers([this.attestorKeypair])
      .rpc();

    console.log(
      `[ReserveAttestor] Attestation submitted for bond type ${bondType}: ${tx}`
    );
  }

  /**
   * Fetch reserve data from a custodian API endpoint.
   * Expects JSON response: { holdings: number, currency: string, timestamp: string }
   * @returns Parsed reserve with holdings as bigint and timestamp as unix seconds.
   */
  async fetchCustodianReserve(endpoint: string): Promise<CustodianReserve> {
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(
        `[ReserveAttestor] Custodian API returned ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      holdings: number;
      currency: string;
      timestamp: string;
    };

    return {
      holdings: BigInt(Math.floor(data.holdings)),
      timestamp: Math.floor(new Date(data.timestamp).getTime() / 1000),
    };
  }
}
