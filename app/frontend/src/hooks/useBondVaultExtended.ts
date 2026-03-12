"use client";

import { useState, useEffect, useCallback } from "react";
import type { BondType } from "@stablebond/types";
import type { BondVaultExtended } from "@stablebond/sdk";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 15_000;

export function useBondVaultExtended(bondType: BondType) {
  const client = useStablebondClient();
  const [vault, setVault] = useState<BondVaultExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await client.getBondVaultExtended(bondType);
      setVault(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch extended vault data");
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
