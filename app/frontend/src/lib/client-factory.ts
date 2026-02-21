import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { StablebondClient } from "@stablebond/sdk";
import { PROGRAM_IDS, RPC_URL } from "./constants";

/** Dummy wallet for read-only client (no signing). */
const dummyKeypair = Keypair.generate();

class ReadOnlyWallet implements Wallet {
  payer = dummyKeypair;
  publicKey = dummyKeypair.publicKey;

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    throw new Error("Read-only wallet cannot sign transactions");
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    throw new Error("Read-only wallet cannot sign transactions");
  }
}

let readOnlyClient: StablebondClient | null = null;

/** Get a read-only StablebondClient (no wallet needed). */
export function getReadOnlyClient(): StablebondClient {
  if (!readOnlyClient) {
    const connection = new Connection(RPC_URL, "confirmed");
    const wallet = new ReadOnlyWallet();
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    readOnlyClient = new StablebondClient(connection, provider, PROGRAM_IDS);
  }
  return readOnlyClient;
}
