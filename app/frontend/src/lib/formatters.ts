/** Convert basis points to percentage string. */
export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2) + "%";
}

/** Format a minor-unit bigint as a USD-style string. */
export function formatUsd(amount: bigint, decimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  const wholeStr = whole.toLocaleString("en-US");
  return `$${wholeStr}.${fracStr}`;
}

/** Format a minor-unit bigint with currency symbol. */
export function formatCurrency(
  amount: bigint,
  currency: string,
  decimals: number = 6
): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  const wholeStr = whole.toLocaleString("en-US");

  const symbols: Record<string, string> = {
    USD: "$",
    MXN: "MX$",
    BRL: "R$",
    JPY: "\u00a5",
  };
  const symbol = symbols[currency] ?? currency + " ";
  return `${symbol}${wholeStr}.${fracStr}`;
}

/** Convert a Unix timestamp (seconds) to a locale date string. */
export function timestampToDate(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Truncate a Solana public key for display. */
export function shortenAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
