/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPublicClient, createWalletClient, http, erc20Abi, decodeEventLog, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { ChainAdapter } from "./adapter";
import type { PayeeHistory, PreparedPayment, Units, VerifyResult } from "../types";

/** USDC on Base mainnet (native Circle USDC). Use as the `coinType` for Base settlement. */
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** The slice of a viem public/wallet client this adapter uses — kept minimal so tests can inject fakes. */
interface PubClient {
  readContract(args: any): Promise<unknown>;
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<any>;
}
interface WalletLike {
  writeContract(args: any): Promise<`0x${string}`>;
}

/**
 * EXPERIMENTAL second settlement chain: USDC on Base (EVM), implementing the same `ChainAdapter`
 * contract as the Sui/Tatum adapter. This proves the architecture is chain-agnostic — the guard
 * engine, 402 flow and dry-run semantics are unchanged; only the settlement adapter differs.
 *
 * OFF BY DEFAULT and NOT live-verified: `services()` does not select it, so the Sui deployment is
 * untouched. To try it you'd inject real viem clients (see `baseEvmFromEnv`), fund a Base wallet,
 * and verify an on-chain transfer. The public x402 ecosystem is largely on Base, so this is the
 * bridge from "Sui-settled vendors" to "guard a real x402 API in its native USDC-on-Base scheme".
 */
export class BaseEvmChain implements ChainAdapter {
  readonly name = "Base mainnet (EVM · USDC via viem) [experimental]";
  private pub: PubClient;
  private wallet?: WalletLike;
  private account: Address;

  constructor(opts: { pub: PubClient; wallet?: WalletLike; account: Address }) {
    this.pub = opts.pub;
    this.wallet = opts.wallet;
    this.account = opts.account;
  }

  agentAddress() {
    return this.account;
  }

  async getBalance(owner: string, coinType: string): Promise<Units> {
    const bal = await this.pub.readContract({
      address: coinType as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner as Address],
    });
    return (bal as bigint).toString();
  }

  /** EVM has no cheap incoming-transfer index on a plain RPC, so degrade safely (as the Sui adapter
   * does, A5): "little history" → the engine treats the payee as new and asks. Known payees still
   * come from Walrus memory, which is the real signal. */
  async payeeHistory(address: string): Promise<PayeeHistory> {
    return { address, incomingTxCount: 0 };
  }

  /**
   * Build + "dry-run" an exact USDC transfer, without signing. There's no Sui-style simulated
   * balance-change object on EVM, so we model the x402 "exact" transfer as the same shape the engine
   * expects: `-amount` from the agent, `+amount` to the payee. The engine's "dry-run must match
   * exactly" check then works unchanged. `ok` reflects whether the balance covers the transfer.
   */
  async preparePayment(to: string, coinType: string, amount: Units): Promise<PreparedPayment> {
    const from = this.account;
    const have = BigInt(await this.getBalance(from, coinType));
    const want = BigInt(amount);
    const ok = have >= want;
    const changes = [
      { owner: from.toLowerCase(), coinType, amount: `-${amount}` },
      { owner: to.toLowerCase(), coinType, amount },
    ];
    const txBytes = Buffer.from(JSON.stringify({ to: coinType, fn: "transfer", args: [to, amount] })).toString("base64");
    return {
      from,
      to,
      coinType,
      amount,
      txBytes,
      dryRun: { ok, error: ok ? undefined : `insufficient USDC on Base: have ${have}, need ${want}`, changes },
    };
  }

  async executePayment(p: PreparedPayment): Promise<string> {
    if (!this.wallet) throw new Error("Base wallet not configured (set BASE_AGENT_PRIVATE_KEY)");
    return this.wallet.writeContract({
      address: p.coinType as Address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [p.to as Address, BigInt(p.amount)],
      account: this.account,
      chain: base,
    });
  }

  /** Vendor side: did `digest` land successfully and emit a USDC Transfer of >= amount to payTo? */
  async verifyPayment(digest: string, expect: { payTo: string; coinType: string; amount: Units }): Promise<VerifyResult> {
    try {
      const rcpt = await this.pub.getTransactionReceipt({ hash: digest as `0x${string}` });
      if (!rcpt || rcpt.status !== "success") return { ok: false, reason: "transaction not successful", digest };
      let moved = 0n;
      let payer: string | undefined;
      for (const log of (rcpt.logs ?? []) as { address: string; data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] }[]) {
        if (log.address.toLowerCase() !== expect.coinType.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics }) as { eventName: string; args: any };
          if (ev.eventName === "Transfer" && String(ev.args.to).toLowerCase() === expect.payTo.toLowerCase()) {
            moved += ev.args.value as bigint;
            payer = String(ev.args.from);
          }
        } catch {
          /* not an ERC-20 Transfer log */
        }
      }
      if (moved < BigInt(expect.amount)) return { ok: false, reason: `moved ${moved}, need ${expect.amount}`, digest, payer, amount: moved.toString() };
      return { ok: true, digest, payer, amount: moved.toString() };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e), digest };
    }
  }

  explorerTxUrl(digest: string) {
    return `https://basescan.org/tx/${digest}`;
  }
}

/**
 * Build a BaseEvmChain from env (experimental; not used by `services()`). With
 * `BASE_AGENT_PRIVATE_KEY` it can sign; without it, it's read-only (balances/verify) and
 * `executePayment` throws. `BASE_RPC_URL` defaults to the public Base endpoint.
 */
export function baseEvmFromEnv(): BaseEvmChain {
  const rpc = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const pub = createPublicClient({ chain: base, transport: http(rpc) }) as unknown as PubClient;
  const pk = process.env.BASE_AGENT_PRIVATE_KEY;
  if (!pk) {
    const account = (process.env.BASE_AGENT_ADDRESS || "0x0000000000000000000000000000000000000000") as Address;
    return new BaseEvmChain({ pub, account });
  }
  const acct = privateKeyToAccount(pk as `0x${string}`);
  const wallet = createWalletClient({ account: acct, chain: base, transport: http(rpc) }) as unknown as WalletLike;
  return new BaseEvmChain({ pub, wallet, account: acct.address });
}
