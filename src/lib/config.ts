import path from "node:path";

/**
 * Two modes:
 *  - "sim":  offline. Simulated Sui ledger + local file memory. For development, tests and rehearsing the demo.
 *  - "live": Sui mainnet through Tatum RPC + Walrus Memory on mainnet. Needed to qualify for Total Recall.
 */
export type Mode = "sim" | "live";

const env = (k: string, d?: string) => process.env[k] ?? d;

// Native USDC on Sui mainnet. VERIFY against Circle/Sui docs before going live (see CHECKLIST.md §D).
const DEFAULT_USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

export function getConfig() {
  const mode = (env("ALLOWANCE_MODE", "sim") as Mode) === "live" ? "live" : "sim";
  return {
    mode,
    network: mode === "live" ? "sui:mainnet" : "sui:sim",
    dataDir: env("ALLOWANCE_DATA_DIR", path.join(process.cwd(), ".data"))!,
    baseUrl: env("ALLOWANCE_BASE_URL", "http://localhost:3000")!,

    // Tatum
    tatumApiKey: env("TATUM_API_KEY", "")!,
    suiRpcUrl: env("SUI_RPC_URL", "https://sui-mainnet.gateway.tatum.io")!,

    // Money
    usdcCoinType: env("USDC_COIN_TYPE", DEFAULT_USDC)!,
    usdcDecimals: Number(env("USDC_DECIMALS", "6")),
    agentPrivateKey: env("AGENT_SUI_PRIVATE_KEY", "")!, // suiprivkey1… — NEVER commit or paste anywhere
    vendorAddress: env("VENDOR_SUI_ADDRESS", "")!,

    // Walrus Memory
    memwalKey: env("MEMWAL_PRIVATE_KEY", "")!,
    memwalAccountId: env("MEMWAL_ACCOUNT_ID", "")!,
    memwalServerUrl: env("MEMWAL_SERVER_URL", "https://relayer.memory.walrus.xyz"),
    memwalNamespace: env("MEMWAL_NAMESPACE", "allowance")!,

    // Hard limits — never learned past (human-set, in base units)
    hardPerPayment: env("HARD_PER_PAYMENT", "1000000")!, // $1.00
    hardDaily: env("HARD_DAILY", "5000000")!, // $5.00
    learnAfterApprovals: Number(env("LEARN_AFTER_APPROVALS", "2")),
    duplicateWindowMin: Number(env("DUPLICATE_WINDOW_MIN", "60")),
    priceSpikeFactor: Number(env("PRICE_SPIKE_FACTOR", "2")),
  };
}
export type Config = ReturnType<typeof getConfig>;

export function assertLive(c: Config) {
  const missing = [
    ["TATUM_API_KEY", c.tatumApiKey],
    ["AGENT_SUI_PRIVATE_KEY", c.agentPrivateKey],
    ["VENDOR_SUI_ADDRESS", c.vendorAddress],
    ["MEMWAL_PRIVATE_KEY", c.memwalKey],
    ["MEMWAL_ACCOUNT_ID", c.memwalAccountId],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Live mode needs: ${missing.join(", ")} (see .env.example)`);
}

export const fmtUsd = (units: string | bigint, decimals = 6) => {
  const n = Number(BigInt(units)) / 10 ** decimals;
  return `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
};
export const toUnits = (usd: number, decimals = 6) => String(Math.round(usd * 10 ** decimals));
