import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { toBase64, fromBase64 } from "@mysten/sui/utils";
import type { ChainAdapter } from "./adapter";
import type { DryRunOutcome, PayeeHistory, PreparedPayment, Units, VerifyResult } from "../types";

/**
 * Minimal JSON-RPC client for Tatum's Sui gateway.
 * Every onchain read/write Allowance makes goes through here — this is the "Tatum Sui RPC" integration.
 */
export class TatumSuiRpc {
  calls: { method: string; at: string; ms: number }[] = [];
  constructor(private url: string, private apiKey: string) {}

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const t0 = Date.now();
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    this.calls.push({ method, at: new Date().toISOString(), ms: Date.now() - t0 });
    if (!res.ok) throw new Error(`Tatum ${method} HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`Tatum ${method}: ${body.error.message}`);
    return body.result as T;
  }

  getBalance = (owner: string, coinType: string) =>
    this.call<{ totalBalance: string }>("suix_getBalance", [owner, coinType]);
  getAllBalances = (owner: string) =>
    this.call<{ coinType: string; totalBalance: string }[]>("suix_getAllBalances", [owner]);
  queryTxs = (filter: Record<string, string>, limit = 50, descending = true) =>
    this.call<{ data: { digest: string; timestampMs?: string }[]; hasNextPage: boolean }>(
      "suix_queryTransactionBlocks",
      [{ filter, options: { showInput: false } }, null, limit, descending],
    );
  getTx = (digest: string) =>
    this.call<any>("sui_getTransactionBlock", [digest, { showEffects: true, showBalanceChanges: true, showInput: true }]);
  dryRun = (txB64: string) => this.call<any>("sui_dryRunTransactionBlock", [txB64]);
  execute = (txB64: string, sig: string) =>
    this.call<any>("sui_executeTransactionBlock", [txB64, [sig], { showEffects: true, showBalanceChanges: true }]);
}

const ownerOf = (o: any): string =>
  typeof o === "string" ? o : (o?.AddressOwner ?? o?.ObjectOwner ?? JSON.stringify(o));

export class TatumSuiChain implements ChainAdapter {
  readonly name = "Sui mainnet via Tatum";
  readonly rpc: TatumSuiRpc;
  private client: SuiJsonRpcClient;
  private keypair?: Ed25519Keypair;

  constructor(opts: { url: string; apiKey: string; agentPrivateKey?: string }) {
    this.rpc = new TatumSuiRpc(opts.url, opts.apiKey);
    // The SDK client is only used to *build* transactions (coin selection, gas). It also talks to Tatum.
    this.client = new SuiJsonRpcClient({
      network: "mainnet",
      transport: new JsonRpcHTTPTransport({ url: opts.url, rpc: { headers: { "x-api-key": opts.apiKey } } }),
    });
    if (opts.agentPrivateKey) {
      const { secretKey } = decodeSuiPrivateKey(opts.agentPrivateKey);
      this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
    }
  }

  agentAddress() {
    if (!this.keypair) throw new Error("AGENT_SUI_PRIVATE_KEY not set");
    return this.keypair.toSuiAddress();
  }

  async getBalance(owner: string, coinType: string): Promise<Units> {
    return (await this.rpc.getBalance(owner, coinType)).totalBalance;
  }

  async payeeHistory(address: string): Promise<PayeeHistory> {
    const r = await this.rpc.queryTxs({ ToAddress: address }, 50, false);
    const first = r.data[0]?.timestampMs;
    return {
      address,
      incomingTxCount: r.data.length,
      firstSeen: first ? new Date(Number(first)).toISOString() : undefined,
    };
  }

  async preparePayment(to: string, coinType: string, amount: Units): Promise<PreparedPayment> {
    const from = this.agentAddress();
    const tx = new Transaction();
    tx.setSender(from);
    tx.transferObjects([coinWithBalance({ type: coinType, balance: BigInt(amount) })], to);
    const bytes = await tx.build({ client: this.client as any });
    const txBytes = toBase64(bytes);
    const r = await this.rpc.dryRun(txBytes);
    const dryRun: DryRunOutcome = {
      ok: r?.effects?.status?.status === "success",
      error: r?.effects?.status?.error,
      changes: (r?.balanceChanges ?? []).map((c: any) => ({ owner: ownerOf(c.owner), coinType: c.coinType, amount: c.amount })),
      gasUsedMist: r?.effects?.gasUsed
        ? String(BigInt(r.effects.gasUsed.computationCost) + BigInt(r.effects.gasUsed.storageCost) - BigInt(r.effects.gasUsed.storageRebate))
        : undefined,
    };
    return { from, to, coinType, amount, txBytes, dryRun };
  }

  async executePayment(p: PreparedPayment): Promise<string> {
    if (!this.keypair) throw new Error("AGENT_SUI_PRIVATE_KEY not set");
    const { signature } = await this.keypair.signTransaction(fromBase64(p.txBytes));
    const r = await this.rpc.execute(p.txBytes, signature);
    if (r?.effects?.status?.status !== "success") throw new Error(`Payment failed: ${r?.effects?.status?.error ?? "unknown"}`);
    return r.digest as string;
  }

  async verifyPayment(digest: string, expect: { payTo: string; coinType: string; amount: Units }): Promise<VerifyResult> {
    let tx: any;
    for (let i = 0; i < 5; i++) {
      try { tx = await this.rpc.getTx(digest); break; } catch (e) { if (i === 4) return { ok: false, digest, reason: String(e) }; await new Promise((r) => setTimeout(r, 800)); }
    }
    if (tx?.effects?.status?.status !== "success") return { ok: false, digest, reason: "transaction did not succeed" };
    const received = (tx.balanceChanges ?? [])
      .filter((c: any) => ownerOf(c.owner).toLowerCase() === expect.payTo.toLowerCase() && c.coinType === expect.coinType)
      .reduce((s: bigint, c: any) => s + BigInt(c.amount), 0n);
    if (received < BigInt(expect.amount)) return { ok: false, digest, reason: `paid ${received}, expected ${expect.amount}` };
    return { ok: true, digest, payer: tx.transaction?.data?.sender, amount: received.toString() };
  }

  explorerTxUrl = (digest: string) => `https://suiscan.xyz/mainnet/tx/${digest}`;
}
