import { Tier, TIER_NAMES, TIER_COLORS } from "@stablebond/types";

interface TierBadgeProps {
  tier: Tier;
}

export function TierBadge({ tier }: TierBadgeProps) {
  const color = TIER_COLORS[tier] ?? "#6B7280";
  const name = TIER_NAMES[tier]?.en ?? "Unknown";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: color + "20",
        color: color,
        borderColor: color + "40",
        borderWidth: 1,
      }}
    >
      {name}
    </span>
  );
}
