import { bpsToPercent } from "@/lib/formatters";

interface ApyBadgeProps {
  apyBps: number;
  oracleEnabled?: boolean;
}

export function ApyBadge({ apyBps, oracleEnabled }: ApyBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-green/10 px-2.5 py-0.5 font-mono text-xs font-medium text-accent-green">
      {bpsToPercent(apyBps)} APY
      {oracleEnabled !== undefined && (
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            oracleEnabled ? "bg-blue-400" : "bg-gray-500"
          }`}
          title={oracleEnabled ? "Oracle-driven" : "Manual APY"}
        />
      )}
    </span>
  );
}
