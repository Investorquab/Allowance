/**
 * Tiny in-process cache for the agent's USDC balance (A3). The dashboard polls
 * `/api/state`, which reads the balance through Tatum — a metered call. Caching it
 * for 30s means many open tabs / fast polls don't burn Tatum credits.
 *
 * Only used in live mode; sim balances are free and instant.
 */
const TTL_MS = 30_000;

let entry: { key: string; at: number; value: string } | null = null;

export function getCachedBalance(key: string): string | null {
  if (entry && entry.key === key && Date.now() - entry.at < TTL_MS) return entry.value;
  return null;
}

export function setCachedBalance(key: string, value: string): void {
  entry = { key, at: Date.now(), value };
}

/** Called after a payment so the next read reflects the new balance immediately. */
export function invalidateBalanceCache(): void {
  entry = null;
}
