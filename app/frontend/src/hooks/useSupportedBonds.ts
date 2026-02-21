"use client";

import { useState, useEffect, useCallback } from "react";
import type { BondConfig } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 30_000;

export function useSupportedBonds() {
  const client = useStablebondClient();
  const [bonds, setBonds] = useState<BondConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await client.getSupportedBonds();
      setBonds(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch bonds");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  return { bonds, loading, error, refetch: fetch };
}
