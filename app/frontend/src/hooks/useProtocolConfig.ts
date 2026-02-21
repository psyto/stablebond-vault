"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProtocolConfig } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";

const POLL_INTERVAL = 30_000;

export function useProtocolConfig() {
  const client = useStablebondClient();
  const [config, setConfig] = useState<ProtocolConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await client.getProtocolConfig();
      setConfig(result);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch protocol config");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  return { config, loading, error, refetch: fetch };
}
