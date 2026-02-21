"use client";

import { useProtocol } from "@/providers/ProtocolProvider";
import { WalletButton } from "./WalletButton";

export function Header() {
  const { config } = useProtocol();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-surface-3 bg-surface-0/80 px-8 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        {config && (
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                config.isActive ? "bg-accent-green" : "bg-accent-red"
              }`}
            />
            <span className="text-sm text-gray-400">
              {config.isActive ? "Protocol Active" : "Protocol Paused"}
            </span>
          </div>
        )}
      </div>
      <WalletButton />
    </header>
  );
}
