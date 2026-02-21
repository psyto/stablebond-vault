"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "@/providers/WalletProvider";
import { ProtocolProvider } from "@/providers/ProtocolProvider";
import { ToastProvider } from "@/components/shared/ToastProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <ProtocolProvider>
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col pl-60">
              <Header />
              <main className="flex-1 p-8">{children}</main>
            </div>
          </div>
        </ToastProvider>
      </ProtocolProvider>
    </WalletProvider>
  );
}
