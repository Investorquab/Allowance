/** Amounts are always integer base units as strings (USDC has 6 decimals). */
export type Units = string;

/** What a paid API asks for in its 402 response (x402-style "exact" scheme on Sui). */
export interface PaymentRequirement {
  scheme: "exact";
  network: string; // "sui:mainnet" | "sui:sim"
  asset: string; // Sui coin type, e.g. 0x…::usdc::USDC
  amount: Units;
  payTo: string; // Sui address
  resource: string; // full URL being paid for
  description: string;
  vendor: string; // vendor id, e.g. "tatum-data"
  vendorName: string;
  endpoint: string; // e.g. "wallet-report"
  nonce: string;
  expiresAt: string; // ISO
  /** Built-in demo "attack" (look-alike vendor or redirected invoice). Always blocked in live mode (A2). */
  demoAttack?: boolean;
}

/** What the agent hands Allowance before paying. */
export interface PaymentRequest {
  id: string;
  createdAt: string;
  agent: string;
  task: string; // why the agent wants this ("Research wallet 0xabc…")
  requirement: PaymentRequirement;
  /** stable key of the request params, used for duplicate detection */
  fingerprint: string;
}

export type Action = "pay" | "ask" | "block";
export type Level = "block" | "ask" | "ok" | "info";

export interface CheckResult {
  code: string;
  level: Level;
  message: string;
}

/** A memory as Allowance understands it. Stored in Walrus as readable text + JSON. */
export type Fact =
  | {
      kind: "decision";
      vendor: string;
      endpoint: string;
      payTo: string;
      amount: Units;
      outcome: "approved" | "denied" | "auto-paid" | "blocked";
      by: "human" | "allowance";
      note?: string;
      at: string;
    }
  | {
      kind: "rule";
      rule:
        | { type: "auto_ok_under"; amount: Units; vendor?: string }
        | { type: "always_ask_above"; amount: Units; vendor?: string }
        | { type: "never_pay"; vendor: string }
        | { type: "daily_budget"; amount: Units };
      source: string; // the human's words
      at: string;
    }
  | {
      kind: "payee";
      vendor: string;
      payTo: string;
      label: string;
      at: string;
    }
  | {
      kind: "note";
      text: string;
      at: string;
    };

export interface StoredFact {
  id: string; // local id
  blobId?: string; // Walrus blob id when stored on mainnet
  fact: Fact;
  text: string; // human-readable sentence
}

export interface Decision {
  requestId: string;
  action: Action;
  summary: string;
  checks: CheckResult[];
  memoriesUsed: { id: string; text: string; blobId?: string }[];
  learnedLimit?: Units; // auto-pay ceiling for this vendor+endpoint learned from memory
  decidedAt: string;
}

export interface DryRunOutcome {
  ok: boolean;
  error?: string;
  /** balance change per (owner, coinType); negative = outflow */
  changes: { owner: string; coinType: string; amount: string }[];
  gasUsedMist?: string;
}

export interface PreparedPayment {
  from: string;
  to: string;
  coinType: string;
  amount: Units;
  txBytes: string; // base64
  dryRun: DryRunOutcome;
}

export interface PayeeHistory {
  address: string;
  incomingTxCount: number; // capped (e.g. 50)
  firstSeen?: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  digest: string;
  payer?: string;
  amount?: Units;
}
