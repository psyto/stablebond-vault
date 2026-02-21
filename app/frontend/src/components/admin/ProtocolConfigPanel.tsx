"use client";

import { useState } from "react";
import type { ProtocolConfig } from "@stablebond/types";
import { formatAmount } from "@stablebond/sdk";
import { bpsToPercent, shortenAddress } from "@/lib/formatters";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface ProtocolConfigPanelProps {
  config: ProtocolConfig;
  onUpdate: (fees: {
    conversionFeeBps: number;
    managementFeeBps: number;
    performanceFeeBps: number;
  }) => Promise<void>;
  loading: boolean;
}

export function ProtocolConfigPanel({
  config,
  onUpdate,
  loading,
}: ProtocolConfigPanelProps) {
  const [conversionFee, setConversionFee] = useState(
    config.conversionFeeBps.toString()
  );
  const [managementFee, setManagementFee] = useState(
    config.managementFeeBps.toString()
  );
  const [performanceFee, setPerformanceFee] = useState(
    config.performanceFeeBps.toString()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdate({
      conversionFeeBps: parseInt(conversionFee) || 0,
      managementFeeBps: parseInt(managementFee) || 0,
      performanceFeeBps: parseInt(performanceFee) || 0,
    });
  };

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Protocol Configuration
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Authority</p>
          <p className="font-mono text-white">
            {shortenAddress(config.authority.toBase58(), 8)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Treasury</p>
          <p className="font-mono text-white">
            {shortenAddress(config.treasury.toBase58(), 8)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Total Deposits</p>
          <p className="font-mono text-white">
            ${formatAmount(config.totalDeposits)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Total Yield Earned</p>
          <p className="font-mono text-white">
            ${formatAmount(config.totalYieldEarned)}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="text-sm font-medium text-gray-300">Fee Settings (bps)</h3>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Conversion ({bpsToPercent(parseInt(conversionFee) || 0)})
            </label>
            <input
              type="number"
              value={conversionFee}
              onChange={(e) => setConversionFee(e.target.value)}
              className="input-field"
              disabled={loading}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Management ({bpsToPercent(parseInt(managementFee) || 0)})
            </label>
            <input
              type="number"
              value={managementFee}
              onChange={(e) => setManagementFee(e.target.value)}
              className="input-field"
              disabled={loading}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Performance ({bpsToPercent(parseInt(performanceFee) || 0)})
            </label>
            <input
              type="number"
              value={performanceFee}
              onChange={(e) => setPerformanceFee(e.target.value)}
              className="input-field"
              disabled={loading}
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <LoadingSpinner /> : "Update Fees"}
        </button>
      </form>
    </div>
  );
}
