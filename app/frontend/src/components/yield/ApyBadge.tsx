import { bpsToPercent } from "@/lib/formatters";

interface ApyBadgeProps {
  apyBps: number;
}

export function ApyBadge({ apyBps }: ApyBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-green/10 px-2.5 py-0.5 font-mono text-xs font-medium text-accent-green">
      {bpsToPercent(apyBps)} APY
    </span>
  );
}
