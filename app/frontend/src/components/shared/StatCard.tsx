interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatCard({ label, value, subValue, trend }: StatCardProps) {
  const trendColor =
    trend === "up"
      ? "text-accent-green"
      : trend === "down"
        ? "text-accent-red"
        : "text-gray-400";

  return (
    <div className="card">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-white">{value}</p>
      {subValue && (
        <p className={`mt-1 font-mono text-sm ${trendColor}`}>{subValue}</p>
      )}
    </div>
  );
}
