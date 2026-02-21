"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProtocol } from "@/providers/ProtocolProvider";

export function useIsAdmin(): boolean {
  const { publicKey } = useWallet();
  const { config } = useProtocol();

  return useMemo(() => {
    if (!publicKey || !config) return false;
    return publicKey.equals(config.authority);
  }, [publicKey, config]);
}
