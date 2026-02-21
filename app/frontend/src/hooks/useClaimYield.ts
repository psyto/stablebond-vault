"use client";

import { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import type { BondType } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";
import { useToast } from "@/components/shared/ToastProvider";

interface ClaimAccounts {
  yieldSourceMint: PublicKey;
  depositVault: PublicKey;
  userToken: PublicKey;
}

export function useClaimYield() {
  const client = useStablebondClient();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const claim = useCallback(
    async (bondType: BondType, accounts: ClaimAccounts) => {
      setLoading(true);
      setTxSignature(null);
      try {
        const sig = await client.claimYield(bondType, accounts);
        setTxSignature(sig);
        addToast("success", "Yield claimed successfully");
        return sig;
      } catch (e: any) {
        addToast("error", e.message ?? "Claim failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client, addToast]
  );

  return { claim, loading, txSignature };
}
