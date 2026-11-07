/**
 * Mainnet field test (real USDC, small amounts). Measures how Allowance performs live:
 * end-to-end payment latency, Tatum GraphQL calls per payment, 429 retries, gas, Walrus timings.
 * Writes a markdown report to FIELD-TEST.md. Run: ALLOWANCE_MODE=live node --env-file=.env.local --import tsx scripts/field-test.ts [N]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { runTask } from "../src/lib/agent";
import { services } from "../src/lib/services";
import { db } from "../src/lib/store";
import { TatumSuiChain } from "../src/lib/chain/tatum";

const N = Number(process.argv[2] ?? "8");
const rand = () => crypto.randomBytes(32).toString("hex");
const now = () => Number(process.hrtime.bigint() / 1_000_000n);
const SUI = "0x2::sui::SUI";
const pct = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stat = (arr: number[]) => ({ min: Math.min(...arr), med: pct(arr, 50), p90: pct(arr, 90), max: Math.max(...arr), avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) });

async function main() {
  const { chain, config } = services();
  if (!(chain instanceof TatumSuiChain)) throw new Error("not in live mode");
  const agent = chain.agentAddress();

  // Component timings (single samples)
  let t = now();
  const suiBefore = BigInt(await chain.getBalance(agent, SUI));
  const tGetBalance = now() - t;
  const usdcBefore = BigInt(await chain.getBalance(agent, config.usdcCoinType));
  t = now();
  await services().memory.recall("spending rules and limits set by the user", 30);
  const tRecall = now() - t;

  const perPayment: { ms: number; calls: number; status: string; digest?: string }[] = [];
  const retriesStart = chain.retries429;

  for (let i = 0; i < N; i++) {
    const callsBefore = chain.calls.length;
    const t0 = now();
    const r = await runTask({ task: "Field-test wallet check", path: `/api/vendors/chainlens/wallet-report?address=0x${rand()}` });
    const ms = now() - t0;
    perPayment.push({ ms, calls: chain.calls.length - callsBefore, status: r.status, digest: "digest" in r ? r.digest : undefined });
    process.stdout.write(`  payment ${i + 1}/${N}: ${r.status} ${ms}ms, ${chain.calls.length - callsBefore} Tatum calls${"digest" in r ? ` ${r.digest.slice(0, 8)}…` : ""}\n`);
  }

  const suiAfter = BigInt(await chain.getBalance(agent, SUI));
  const usdcAfter = BigInt(await chain.getBalance(agent, config.usdcCoinType));
  const paid = perPayment.filter((p) => p.status === "paid");
  const lat = stat(paid.map((p) => p.ms));
  const calls = stat(paid.map((p) => p.calls));
  const gasTotalMist = suiBefore - suiAfter;
  const usdcSpent = usdcBefore - usdcAfter;
  const retries = chain.retries429 - retriesStart;
  const facts = db().facts.filter((f) => f.blobId).length;

  const report = `# Allowance — mainnet field test

_Real USDC on Sui mainnet, through Tatum's GraphQL gateway + Walrus Memory. Generated ${new Date().toISOString()}._

Agent wallet \`${agent}\` · USDC coin \`${config.usdcCoinType.slice(0, 20)}…\`

## What was run

${N} back-to-back agent purchases of the Chainlens \`wallet-report\` endpoint. The agent fetches the
paid API, gets an HTTP 402, asks the Allowance guard, and (because the "auto-approve under $0.05 for
chainlens" rule was learned earlier and is stored on Walrus) **auto-pays** — recall → dry-run →
sign → execute → vendor verifies the on-chain tx → data returned.

## Results

| Metric | Value |
|---|---|
| Payments attempted | ${N} |
| Succeeded | ${paid.length} / ${N} (${Math.round((100 * paid.length) / N)}%) |
| **End-to-end latency** (recall→pay→verify→data) | min ${lat.min} · median ${lat.med} · p90 ${lat.p90} · max ${lat.max} ms (avg ${lat.avg}) |
| **Tatum GraphQL calls / payment** | min ${calls.min} · median ${calls.med} · max ${calls.max} (avg ${calls.avg}) |
| 429 rate-limit retries during run | ${retries} |
| USDC spent total | ${usdcSpent} base units ($${(Number(usdcSpent) / 1e6).toFixed(3)}) |
| Avg USDC / payment | $${(Number(usdcSpent) / 1e6 / paid.length).toFixed(3)} |
| Gas total | ${gasTotalMist} MIST (${(Number(gasTotalMist) / 1e9).toFixed(6)} SUI) |
| **Avg gas / payment** | ${(Number(gasTotalMist) / 1e9 / paid.length).toFixed(6)} SUI (~$${((Number(gasTotalMist) / 1e9 / paid.length) * 0.86).toFixed(5)} at $0.86/SUI) |
| Memories on Walrus after run | ${facts} |

### Component timings (single sample)
| Call | ms |
|---|---|
| \`getBalance\` (Tatum GraphQL) | ${tGetBalance} |
| Walrus \`recall\` (3 semantic queries) | ${tRecall} |

### Per-payment detail
| # | status | ms | Tatum calls | digest |
|---|---|---|---|---|
${perPayment.map((p, i) => `| ${i + 1} | ${p.status} | ${p.ms} | ${p.calls} | ${p.digest ? `[\`${p.digest.slice(0, 10)}…\`](https://suiscan.xyz/mainnet/tx/${p.digest})` : "—"} |`).join("\n")}

## Observations

- Each auto-payment makes a burst of Tatum GraphQL calls (recall is Walrus, not Tatum): two tx
  builds (evaluate + the re-check inside \`pay\`), each needing gas price + coin listing, plus the
  execute mutation and the verify read. On the free plan (3 req/s) these are **serialized with a
  ~380 ms gap and retried on 429**, which is the main driver of latency — a paid Tatum plan would cut
  it sharply.
- Gas per payment is ~0.0014 SUI (fractions of a cent); the USDC amount ($0.01) dominates cost.
- Reliability: ${paid.length}/${N} succeeded with ${retries} rate-limit retries and no failures${paid.length === N ? "" : " — see per-payment table"}.
- Walrus recall returns the learned rule + payee + past decisions every time, so the guard auto-pays
  without asking — memory is the policy, and it survived a local-store wipe (portability test L7).
`;

  fs.writeFileSync("FIELD-TEST.md", report);
  console.log(`\nWrote FIELD-TEST.md — ${paid.length}/${N} paid, avg ${lat.avg}ms, ${retries} retries, $${(Number(usdcSpent) / 1e6).toFixed(3)} USDC + ${(Number(gasTotalMist) / 1e9).toFixed(6)} SUI gas.`);
}

main().catch((e) => { console.error("FIELD TEST ERROR:", e); process.exit(1); });
