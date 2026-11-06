import fs from "node:fs";
import path from "node:path";
import { getConfig } from "./config";
import type { Decision, PaymentRequest, StoredFact } from "./types";

export interface PaymentRecord {
  requestId: string;
  digest: string;
  amount: string;
  to: string;
  at: string;
  explorerUrl: string | null;
  verifiedByVendor?: boolean;
}

export interface PendingApproval {
  requestId: string;
  createdAt: string;
  resolved?: { outcome: "approved" | "denied"; note?: string; at: string; makeRule?: boolean };
}

export interface ActivityItem {
  requestId: string;
  at: string;
  day: number; // demo day index (0 = real time)
  task: string;
  vendor: string;
  endpoint: string;
  amount: string;
  payTo: string;
  action: "pay" | "ask" | "block";
  final: "paid" | "pending" | "denied" | "blocked" | "failed";
  summary: string;
  digest?: string;
  url?: string;
  result?: unknown;
}

export interface SimLedger {
  balances: Record<string, Record<string, string>>; // owner -> coinType -> units
  txs: { digest: string; from: string; to: string; coinType: string; amount: string; at: string }[];
}

export interface DB {
  requests: Record<string, PaymentRequest>;
  decisions: Record<string, Decision>;
  pending: PendingApproval[];
  payments: PaymentRecord[];
  activity: ActivityItem[];
  facts: StoredFact[]; // local mirror (live: mirrors what was written to Walrus)
  usedDigests: string[];
  nonces: Record<string, { requirementHash: string; issuedAt: string }>;
  sim: SimLedger;
  demoDay: number;
}

const empty = (): DB => ({
  requests: {},
  decisions: {},
  pending: [],
  payments: [],
  activity: [],
  facts: [],
  usedDigests: [],
  nonces: {},
  sim: { balances: {}, txs: [] },
  demoDay: 0,
});

const g = globalThis as unknown as { __allowanceDb?: DB; __allowanceDbFile?: string };

function file() {
  const { dataDir, mode } = getConfig();
  return path.join(dataDir, `allowance-${mode}.json`);
}

export function db(): DB {
  const f = file();
  if (g.__allowanceDb && g.__allowanceDbFile === f) return g.__allowanceDb;
  let d = empty();
  try {
    if (fs.existsSync(f)) d = { ...empty(), ...JSON.parse(fs.readFileSync(f, "utf8")) };
  } catch {
    /* corrupted file → start fresh */
  }
  g.__allowanceDb = d;
  g.__allowanceDbFile = f;
  return d;
}

export function save() {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db(), null, 2));
  fs.renameSync(tmp, f);
}

export function resetDb(keepSimBalances = false) {
  const prev = db().sim;
  g.__allowanceDb = empty();
  if (keepSimBalances) g.__allowanceDb.sim = prev;
  save();
}

export const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
