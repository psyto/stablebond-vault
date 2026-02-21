"use client";

import { useState, useEffect, useCallback } from "react";
import type { BondType } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 15_000;

export interface BondVault {
  authority: import("@solana/web3.js").PublicKey;
  currencyMint: import("@solana/web3.js").PublicKey;
  shareMint: import("@solana/web3.js").PublicKey;
  currencyVault: import("@solana/web3.js").PublicKey;
  bondType: BondType;
  couponRateBps: number;
  maturityDate: bigint;
  targetApyBps: number;
  totalDeposits: bigint;
  totalShares: bigint;
  navPerShare: bigint;
  lastAccrual: bigint;
  isActive: boolean;
}

export function useBondVault(bondType: BondType) {
  const client = useStablebondClient();
  const [vault, setVault] = useState<BondVault | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await client.getBondVault(bondType);
      setVault(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch bond vault");
    } finally {
      setLoading(false);
    }
  }, [client, bondType]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  return { vault, loading, error, refetch: fetch };
}
