"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { UserPosition } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 15_000;

export function useUserPortfolio() {
  const client = useStablebondClient();
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!publicKey) {
      setPositions([]);
      setLoading(false);
      return;
    }
    try {
      const result = await client.getPortfolio(publicKey);
      setPositions(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch portfolio");
    } finally {
      setLoading(false);
    }
  }, [client, publicKey]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  return { positions, loading, error, refetch: fetch };
}
