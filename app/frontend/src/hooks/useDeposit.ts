"use client";

import { useState, useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { BondType } from "@stablebond/types";
import { useStablebondClient } from "./useStablebondClient";
import { useToast } from "@/components/shared/ToastProvider";

interface DepositAccounts {
  yieldSourceMint: PublicKey;
  userToken: PublicKey;
  depositVault: PublicKey;
  whitelistEntry: PublicKey;
  sovereignIdentity: PublicKey;
}

export function useDeposit() {
  const client = useStablebondClient();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const deposit = useCallback(
    async (amount: bigint, bondType: BondType, accounts: DepositAccounts) => {
      setLoading(true);
      setTxSignature(null);
      try {
        const sig = await client.depositDirect(
          new BN(amount.toString()),
          bondType,
          accounts
        );
        setTxSignature(sig);
        addToast("success", "Deposit submitted successfully");
        return sig;
      } catch (e: any) {
        addToast("error", e.message ?? "Deposit failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client, addToast]
  );

  return { deposit, loading, txSignature };
}
