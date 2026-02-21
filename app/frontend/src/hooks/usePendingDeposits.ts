"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { PendingDeposit, BondType } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 10_000;

export function usePendingDeposits(bondType: BondType) {
  const client = useStablebondClient();
  const { publicKey } = useWallet();
  const [deposits, setDeposits] = useState<PendingDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!publicKey) {
      setDeposits([]);
      setLoading(false);
      return;
    }
    try {
      const result = await client.getPendingDeposits(publicKey, bondType);
      setDeposits(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch pending deposits");
    } finally {
      setLoading(false);
    }
  }, [client, publicKey, bondType]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  return { deposits, loading, error, refetch: fetch };
}
