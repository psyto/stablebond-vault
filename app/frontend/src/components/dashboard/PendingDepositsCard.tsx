"use client";

import type { PendingDeposit } from "@stablebond/types";
import {
  BOND_TYPE_LABELS,
  DepositStatus,
  DEPOSIT_STATUS_LABELS,
} from "@stablebond/types";
import { formatAmount } from "@stablebond/sdk";
import { timestampToDate } from "@/lib/formatters";

interface PendingDepositsCardProps {
  deposits: PendingDeposit[];
}

function statusColor(status: DepositStatus): string {
  switch (status) {
    case DepositStatus.Pending:
      return "text-accent-amber";
    case DepositStatus.Converting:
      return "text-accent-blue";
    case DepositStatus.Converted:
      return "text-accent-green";
    case DepositStatus.Cancelled:
    case DepositStatus.Expired:
      return "text-accent-red";
    default:
      return "text-gray-400";
  }
}

export function PendingDepositsCard({ deposits }: PendingDepositsCardProps) {
  const active = deposits.filter(
    (d) =>
      d.status === DepositStatus.Pending ||
      d.status === DepositStatus.Converting
  );

  if (active.length === 0) return null;

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Pending Deposits
      </h2>
      <div className="space-y-3">
        {active.map((deposit) => (
          <div
            key={deposit.nonce.toString()}
            className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3"
          >
            <div>
              <span className="font-medium text-white">
                {BOND_TYPE_LABELS[deposit.bondType] ?? "Unknown"}
              </span>
              <span className="ml-3 font-mono text-sm text-gray-300">
                {formatAmount(deposit.sourceAmount)}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500">
                Expires {timestampToDate(deposit.expiresAt)}
              </span>
              <span
                className={`text-sm font-medium ${statusColor(deposit.status)}`}
              >
                {DEPOSIT_STATUS_LABELS[deposit.status]?.en ?? "Unknown"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
