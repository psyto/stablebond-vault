"use client";

import type { YieldSourceAccount } from "@stablebond/types";
import { BOND_TYPE_LABELS } from "@stablebond/types";
import { YIELD_SOURCE_LABELS, YieldSourceType } from "@stablebond/types";
import { formatAmount } from "@stablebond/sdk";
import { bpsToPercent, shortenAddress } from "@/lib/formatters";

interface YieldSourcePanelProps {
  yieldSources: YieldSourceAccount[];
}

export function YieldSourcePanel({ yieldSources }: YieldSourcePanelProps) {
  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-white">Yield Sources</h2>

      {yieldSources.length === 0 ? (
        <p className="text-gray-400">No yield sources configured</p>
      ) : (
        <div className="space-y-3">
          {yieldSources.map((source, idx) => {
            const nameBytes = source.name.filter((b) => b !== 0);
            const name = new TextDecoder().decode(new Uint8Array(nameBytes));
            const sourceType =
              YIELD_SOURCE_LABELS[source.sourceType as YieldSourceType] ??
              "Unknown";

            return (
              <div key={idx} className="rounded-lg bg-surface-2 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">
                      {name || sourceType}
                    </span>
                    <span className="rounded bg-surface-3 px-2 py-0.5 text-xs text-gray-400">
                      {sourceType}
                    </span>
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        source.isActive ? "bg-accent-green" : "bg-gray-500"
                      }`}
                    />
                  </div>
                  <span className="font-mono text-sm text-accent-green">
                    {bpsToPercent(source.currentApyBps)} APY
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Total Deposited</p>
                    <p className="font-mono text-white">
                      ${formatAmount(source.totalDeposited)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">NAV/Share</p>
                    <p className="font-mono text-white">
                      {formatAmount(source.navPerShare)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Token Mint</p>
                    <p className="font-mono text-white">
                      {shortenAddress(source.tokenMint.toBase58())}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
