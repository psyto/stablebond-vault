"use client";

import { useState, useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { BondType } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";
import { useToast } from "@/components/shared/ToastProvider";

interface WithdrawAccounts {
  yieldSourceMint: PublicKey;
  depositVault: PublicKey;
  userToken: PublicKey;
}

export function useWithdraw() {
  const client = useStablebondClient();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const withdraw = useCallback(
    async (shares: bigint, bondType: BondType, accounts: WithdrawAccounts) => {
      setLoading(true);
      setTxSignature(null);
      try {
        const sig = await client.withdraw(
          new BN(shares.toString()),
          bondType,
          accounts
        );
        setTxSignature(sig);
        addToast("success", "Withdrawal submitted successfully");
        return sig;
      } catch (e: any) {
        addToast("error", e.message ?? "Withdrawal failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client, addToast]
  );

  return { withdraw, loading, txSignature };
}
