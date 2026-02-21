"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { ProtocolConfig, BondConfig } from "@stablebond/types";
import { useProtocolConfig } from "@/hooks/useProtocolConfig";
import { useSupportedBonds } from "@/hooks/useSupportedBonds";

interface ProtocolContextValue {
  config: ProtocolConfig | null;
  bonds: BondConfig[];
  loading: boolean;
  error: string | null;
}

const ProtocolContext = createContext<ProtocolContextValue>({
  config: null,
  bonds: [],
  loading: true,
  error: null,
});

export function useProtocol() {
  return useContext(ProtocolContext);
}

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const {
    config,
    loading: configLoading,
    error: configError,
  } = useProtocolConfig();
  const {
    bonds,
    loading: bondsLoading,
    error: bondsError,
  } = useSupportedBonds();

  return (
    <ProtocolContext.Provider
      value={{
        config,
        bonds,
        loading: configLoading || bondsLoading,
        error: configError ?? bondsError,
      }}
    >
      {children}
    </ProtocolContext.Provider>
  );
}
