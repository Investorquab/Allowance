import crypto from "node:crypto";
import type { ChainAdapter } from "./adapter";
import { db, save } from "../store";
import type { PayeeHistory, PreparedPayment, Units, VerifyResult } from "../types";

/** Deterministic fake Sui address from a label (0x + 64 hex). */
export const simAddress = (label: string) => "0x" + crypto.createHash("sha256").update(label).digest("hex");

/**
 * Offline stand-in for Sui: a ledger in the local data file.
 * Same interface as the Tatum adapter so the guard, vendor and agent code paths are identical.
 */
export class SimChain implements ChainAdapter {
  readonly name = "Simulated Sui ledger (offline)";
  constructor(private agent: string) {}

  agentAddress() {
    return this.agent;
  }

  fund(owner: string, coinType: string, amount: Units) {
    const b = (db().sim.balances[owner] ??= {});
    b[coinType] = (BigInt(b[coinType] ?? "0") + BigInt(amount)).toString();
    save();
  }

  async getBalance(owner: string, coinType: string): Promise<Units> {
    return db().sim.balances[owner]?.[coinType] ?? "0";
  }

  async payeeHistory(address: string): Promise<PayeeHistory> {
    const txs = db().sim.txs.filter((t) => t.to === address);
    return { address, incomingTxCount: Math.min(txs.length, 50), firstSeen: txs[0]?.at };
  }

  async preparePayment(to: string, coinType: string, amount: Units): Promise<PreparedPayment> {
    const from = this.agent;
    const bal = BigInt(await this.getBalance(from, coinType));
    const ok = bal >= BigInt(amount);
    const txBytes = Buffer.from(JSON.stringify({ from, to, coinType, amount, n: crypto.randomUUID() })).toString("base64");
    return {
      from, to, coinType, amount, txBytes,
      dryRun: ok
        ? { ok, changes: [{ owner: from, coinType, amount: `-${amount}` }, { owner: to, coinType, amount }], gasUsedMist: "1997880" }
        : { ok, error: "InsufficientCoinBalance", changes: [] },
    };
  }

  async executePayment(p: PreparedPayment): Promise<string> {
    const t = JSON.parse(Buffer.from(p.txBytes, "base64").toString()) as { from: string; to: string; coinType: string; amount: string };
    const d = db();
    const fb = (d.sim.balances[t.from] ??= {});
    const tb = (d.sim.balances[t.to] ??= {});
    const bal = BigInt(fb[t.coinType] ?? "0");
    if (bal < BigInt(t.amount)) throw new Error("Payment failed: InsufficientCoinBalance");
    fb[t.coinType] = (bal - BigInt(t.amount)).toString();
    tb[t.coinType] = (BigInt(tb[t.coinType] ?? "0") + BigInt(t.amount)).toString();
    const digest = crypto.createHash("sha256").update(p.txBytes).digest("base64url").slice(0, 44);
    d.sim.txs.push({ digest, ...t, at: new Date().toISOString() });
    save();
    return digest;
  }

  async verifyPayment(digest: string, expect: { payTo: string; coinType: string; amount: Units }): Promise<VerifyResult> {
    const t = db().sim.txs.find((x) => x.digest === digest);
    if (!t) return { ok: false, digest, reason: "unknown transaction" };
    if (t.to !== expect.payTo || t.coinType !== expect.coinType) return { ok: false, digest, reason: "paid the wrong address or coin" };
    if (BigInt(t.amount) < BigInt(expect.amount)) return { ok: false, digest, reason: `paid ${t.amount}, expected ${expect.amount}` };
    return { ok: true, digest, payer: t.from, amount: t.amount };
  }

  explorerTxUrl = () => null;
}
