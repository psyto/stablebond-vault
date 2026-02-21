"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { UserPosition } from "@stablebond/types";
import type { BondType } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 15_000;

export function useUserPosition(bondType: BondType) {
  const client = useStablebondClient();
  const { publicKey } = useWallet();
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!publicKey) {
      setPosition(null);
      setLoading(false);
      return;
    }
    try {
      const result = await client.getUserPosition(publicKey, bondType);
      setPosition(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch position");
    } finally {
      setLoading(false);
    }
  }, [client, publicKey, bondType]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  return { position, loading, error, refetch: fetch };
}
