"use client";

import { useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { StablebondClient } from "@stablebond/sdk";
import { PROGRAM_IDS } from "@/lib/constants";
import { getReadOnlyClient } from "@/lib/client-factory";

/** Returns a StablebondClient backed by the connected wallet, or a read-only client if disconnected. */
export function useStablebondClient(): StablebondClient {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return getReadOnlyClient();

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new StablebondClient(connection, provider, PROGRAM_IDS);
  }, [connection, wallet]);
}
