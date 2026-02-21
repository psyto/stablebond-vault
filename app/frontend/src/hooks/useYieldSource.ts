"use client";

import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import type { YieldSourceAccount } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 15_000;

export function useYieldSource(tokenMint: PublicKey | null) {
  const client = useStablebondClient();
  const [yieldSource, setYieldSource] = useState<YieldSourceAccount | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!tokenMint) {
      setYieldSource(null);
      setLoading(false);
      return;
    }
    try {
      const result = await client.getYieldSource(tokenMint);
      setYieldSource(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch yield source");
    } finally {
      setLoading(false);
    }
  }, [client, tokenMint?.toBase58()]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  return { yieldSource, loading, error, refetch: fetch };
}
