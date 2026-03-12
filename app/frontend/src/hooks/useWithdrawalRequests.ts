"use client";

import { useState, useEffect, useCallback } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import type { BondType } from "@stablebond/types";
import type { WithdrawalRequest } from "@stablebond/sdk";
import { useStablebondClient } from "./useStablebondClient";
import { useToast } from "@/components/shared/ToastProvider";

interface WithdrawAccounts {
  yieldSourceMint: PublicKey;
  depositVault: PublicKey;
  userToken: PublicKey;
}

export function useWithdrawalRequests(bondType: BondType) {
  const client = useStablebondClient();
  const { publicKey } = useWallet();
  const { addToast } = useToast();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!publicKey) {
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      const result = await client.getWithdrawalRequests(publicKey, bondType);
      setRequests(result);
    } catch {
      // Silently fail for polling
    } finally {
      setLoading(false);
    }
  }, [client, publicKey, bondType]);

  useEffect(() => {
    fetchRequests();
    const id = setInterval(fetchRequests, 15_000);
    return () => clearInterval(id);
  }, [fetchRequests]);

  const requestWithdrawal = useCallback(
    async (shares: bigint, accounts: WithdrawAccounts) => {
      setActionLoading(true);
      setTxSignature(null);
      try {
        const sig = await client.requestWithdrawal(
          new BN(shares.toString()),
          bondType,
          accounts
        );
        setTxSignature(sig);
        addToast("success", "Withdrawal requested - cooldown period started");
        await fetchRequests();
        return sig;
      } catch (e: any) {
        addToast("error", e.message ?? "Withdrawal request failed");
        throw e;
      } finally {
        setActionLoading(false);
      }
    },
    [client, bondType, addToast, fetchRequests]
  );

  const claimWithdrawal = useCallback(
    async (nonce: bigint, accounts: WithdrawAccounts) => {
      setActionLoading(true);
      setTxSignature(null);
      try {
        const sig = await client.claimWithdrawal(nonce, bondType, accounts);
        setTxSignature(sig);
        addToast("success", "Withdrawal claimed successfully");
        await fetchRequests();
        return sig;
      } catch (e: any) {
        addToast("error", e.message ?? "Claim failed");
        throw e;
      } finally {
        setActionLoading(false);
      }
    },
    [client, bondType, addToast, fetchRequests]
  );

  const cancelWithdrawal = useCallback(
    async (nonce: bigint, accounts: { yieldSourceMint: PublicKey }) => {
      setActionLoading(true);
      setTxSignature(null);
      try {
        const sig = await client.cancelWithdrawal(nonce, bondType, accounts);
        setTxSignature(sig);
        addToast("success", "Withdrawal cancelled");
        await fetchRequests();
        return sig;
      } catch (e: any) {
        addToast("error", e.message ?? "Cancellation failed");
        throw e;
      } finally {
        setActionLoading(false);
      }
    },
    [client, bondType, addToast, fetchRequests]
  );

  return {
    requests,
    loading,
    actionLoading,
    txSignature,
    requestWithdrawal,
    claimWithdrawal,
    cancelWithdrawal,
    refetch: fetchRequests,
  };
}
