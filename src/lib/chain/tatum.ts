import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { toBase64, fromBase64 } from "@mysten/sui/utils";
import type { ChainAdapter } from "./adapter";
import type { DryRunOutcome, PayeeHistory, PreparedPayment, Units, VerifyResult } from "../types";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The subset of a transaction/simulation result Allowance reads. The SDK's unified result is a
 * `$kind`-discriminated union with heavy generics; we narrow to this structural view. */
interface TxView {
  digest: string;
  effects?: {
    status?: { success?: boolean; error?: { message?: string } | null };
    gasUsed?: { computationCost: string; storageCost: string; storageRebate: string };
  };
  balanceChanges?: { address?: string; coinType: string; amount: string }[];
  transaction?: { sender?: string };
}
const asTx = (r: { Transaction?: unknown; FailedTransaction?: unknown } | undefined): TxView | undefined =>
  (r?.Transaction ?? r?.FailedTransaction) as TxView | undefined;

/**
 * Tatum's Sui mainnet gateway serves **GraphQL** (JSON-RPC was deprecated network-wide by Sui).
 * Everything onchain Allowance reads or writes goes through `SuiGraphQLClient` pointed at Tatum —
 * this is the "Tatum Sui RPC" integration. The SDK's unified client API means the same code builds,
 * dry-runs (simulate), executes and reads transactions over GraphQL.
 */
export class TatumSuiChain implements ChainAdapter {
  readonly name = "Sui mainnet via Tatum (GraphQL)";
  /** One entry per GraphQL request — surfaced in the dashboard as the "Tatum calls" counter. */
  readonly calls: { method: string; at: string; ms: number }[] = [];
  /** Count of requests that hit a 429 and were retried (free-plan rate limiting). For field-test metrics. */
  retries429 = 0;
  private client: SuiGraphQLClient;
  private keypair?: Ed25519Keypair;
  private gasBudget: bigint;

  constructor(opts: { url: string; apiKey: string; agentPrivateKey?: string; gasBudgetMist?: string }) {
    this.gasBudget = BigInt(opts.gasBudgetMist ?? "20000000");
    const url = /\/graphql\/?$/.test(opts.url) ? opts.url : `${opts.url.replace(/\/+$/, "")}/graphql`;
    this.client = new SuiGraphQLClient({
      url,
      network: "mainnet",
      headers: { "x-api-key": opts.apiKey },
      // Tatum's free plan caps at 3 req/s, and tx building fans out several queries at once.
      // Serialize every request through a queue with a min gap, and retry on 429 with backoff.
      fetch: this.throttledFetch(380, 5),
    });
    if (opts.agentPrivateKey) {
      const { secretKey } = decodeSuiPrivateKey(opts.agentPrivateKey);
      this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
    }
  }

  private throttledFetch(minGapMs: number, maxRetries: number) {
    let queue: Promise<unknown> = Promise.resolve();
    let last = 0;
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const run = async (): Promise<Response> => {
        for (let attempt = 0; ; attempt++) {
          const wait = minGapMs - (Date.now() - last);
          if (wait > 0) await sleep(wait);
          last = Date.now();
          const t0 = Date.now();
          const res = await fetch(input, init);
          this.calls.push({ method: "graphql", at: new Date().toISOString(), ms: Date.now() - t0 });
          if (res.status !== 429 || attempt >= maxRetries) return res;
          this.retries429++;
          await sleep(700 * (attempt + 1));
        }
      };
      const result = queue.then(run, run);
      queue = result.then(() => {}, () => {});
      return result;
    };
  }

  agentAddress() {
    if (!this.keypair) throw new Error("AGENT_SUI_PRIVATE_KEY not set");
    return this.keypair.toSuiAddress();
  }

  /** Reference gas price (MIST), as a decimal string. Used by health checks and check:live. */
  async referenceGasPrice(): Promise<string> {
    return (await this.client.getReferenceGasPrice()).referenceGasPrice;
  }

  async getBalance(owner: string, coinType: string): Promise<Units> {
    return (await this.client.getBalance({ owner, coinType })).balance.balance;
  }

  /** All coin balances for an address (used by the Chainlens vendor's live data). */
  async allBalances(owner: string): Promise<{ coinType: string; totalBalance: string }[]> {
    const { balances } = await this.client.listBalances({ owner });
    return balances.map((b) => ({ coinType: b.coinType, totalBalance: b.balance }));
  }

  /** Recent outgoing tx digests (best effort — returns [] if the gateway can't list history). */
  async recentOutgoing(owner: string, limit = 10): Promise<string[]> {
    try {
      const page = await this.client.listTransactions({ filter: { sender: owner }, order: "descending", limit });
      return page.transactions
        .map((t) => (t.Transaction ?? t.FailedTransaction)?.digest)
        .filter((d): d is string => !!d);
    } catch {
      return [];
    }
  }

  async payeeHistory(address: string): Promise<PayeeHistory> {
    // A5: Tatum's GraphQL indexer exposes no "incoming transfer" filter (only sender/function),
    // and listTransactions is unreliable on the gateway. Degrade safely: report unknown history.
    // The guard treats <3 incoming txs as "new / little history" → ask, which is the safe default;
    // once a payee is learned in Walrus memory, it's recognised regardless of chain history.
    return { address, incomingTxCount: 0 };
  }

  async preparePayment(to: string, coinType: string, amount: Units): Promise<PreparedPayment> {
    const from = this.agentAddress();
    const amt = BigInt(amount);

    const tx = new Transaction();
    tx.setSender(from);
    // Explicit budget avoids the automatic gas-estimation dry-run inside build() (one fewer call,
    // one fewer thing the gateway must support). Coin selection + gas price still resolve via GraphQL.
    tx.setGasBudget(this.gasBudget);
    tx.transferObjects([coinWithBalance({ type: coinType, balance: amt })], to);

    let built: Uint8Array;
    try {
      built = await tx.build({ client: this.client });
    } catch (e) {
      throw new Error(`could not build payment: ${errMsg(e)}`);
    }
    const txBytes = toBase64(built);

    const sim = await this.client.simulateTransaction({
      transaction: built,
      include: { effects: true, balanceChanges: true },
    });
    const t = asTx(sim);
    const eff = t?.effects;
    const gu = eff?.gasUsed;
    const dryRun: DryRunOutcome = {
      ok: eff?.status?.success === true,
      error: eff?.status?.error?.message ?? undefined,
      changes: (t?.balanceChanges ?? []).map((c) => ({ owner: c.address ?? "", coinType: c.coinType, amount: c.amount })),
      gasUsedMist: gu
        ? String(BigInt(gu.computationCost) + BigInt(gu.storageCost) - BigInt(gu.storageRebate))
        : undefined,
    };
    return { from, to, coinType, amount, txBytes, dryRun };
  }

  async executePayment(p: PreparedPayment): Promise<string> {
    if (!this.keypair) throw new Error("AGENT_SUI_PRIVATE_KEY not set");
    const bytes = fromBase64(p.txBytes);
    const { signature } = await this.keypair.signTransaction(bytes);
    const result = await this.client.executeTransaction({
      transaction: bytes,
      signatures: [signature],
      include: { effects: true },
    });
    const t = asTx(result);
    if (t?.effects?.status?.success !== true) {
      throw new Error(`Payment failed: ${t?.effects?.status?.error?.message ?? "unknown"}`);
    }
    return t.digest;
  }

  async verifyPayment(digest: string, expect: { payTo: string; coinType: string; amount: Units }): Promise<VerifyResult> {
    // GraphQL reads an index that trails execution — wait for the tx to be indexed before reading.
    try {
      await this.client.waitForTransaction({ digest, timeout: 20_000 });
    } catch {
      /* fall through to the retry loop */
    }
    let t: TxView | undefined;
    for (let i = 0; i < 5; i++) {
      try {
        t = asTx(
          await this.client.getTransaction({
            digest,
            include: { effects: true, balanceChanges: true, transaction: true },
          }),
        );
        break;
      } catch (e) {
        if (i === 4) return { ok: false, digest, reason: errMsg(e) };
        await sleep(800);
      }
    }
    if (t?.effects?.status?.success !== true) return { ok: false, digest, reason: "transaction did not succeed" };

    const changes = t.balanceChanges ?? [];
    const received = changes
      .filter((c) => c.address?.toLowerCase() === expect.payTo.toLowerCase() && c.coinType === expect.coinType)
      .reduce((s, c) => s + BigInt(c.amount), 0n);
    if (received < BigInt(expect.amount)) return { ok: false, digest, reason: `paid ${received}, expected ${expect.amount}` };

    // Payer = the transaction sender. Fall back to the address that paid gas (negative SUI change).
    const sender =
      t.transaction?.sender ??
      changes.find((c) => c.coinType === SUI_COIN_TYPE && BigInt(c.amount) < 0n)?.address;
    return { ok: true, digest, payer: sender, amount: received.toString() };
  }

  explorerTxUrl = (digest: string) => `https://suiscan.xyz/mainnet/tx/${digest}`;
}
