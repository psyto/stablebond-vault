"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortenAddress } from "@/lib/formatters";

export function WalletButton() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (connecting) {
    return (
      <button className="btn-secondary text-sm" disabled>
        Connecting...
      </button>
    );
  }

  if (publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm text-gray-300">
          {shortenAddress(publicKey.toBase58())}
        </span>
        <button
          onClick={() => disconnect()}
          className="btn-secondary text-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setVisible(true)} className="btn-primary text-sm">
      Connect Wallet
    </button>
  );
}
