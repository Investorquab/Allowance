# Allowance — mainnet field test

_Real USDC on Sui mainnet, settled and verified through Tatum's GraphQL gateway, with the agent's
rules recalled from Walrus Memory. Agent wallet `0x7061517d…cbc0d3a3`._

## What was measured

Back-to-back agent purchases of the Chainlens `wallet-report` endpoint. Each one is the full loop:
the agent calls the paid API → gets HTTP **402** → asks the Allowance guard → the guard **recalls**
from Walrus (rules, past approvals, known payees) → **dry-runs** the exact tx on Sui via Tatum →
**signs + executes** → the vendor **verifies** the on-chain tx through Tatum → data is returned.
Because the rule _"auto-approve under $0.05 for chainlens"_ was learned earlier and lives on Walrus,
every one of these **auto-pays with no human ask**.

## Headline results

| Metric | Result |
|---|---|
| **Reliability** | **12 / 12 payments succeeded (100%)** across runs, zero failures |
| **Cost — USDC** | exactly the price per call ($0.01); no spread, no facilitator fee |
| **Cost — gas** | ~**0.00142 SUI per payment** (~$0.0012) — fractions of a cent |
| **Latency** | ~**33 s per auto-payment** on Tatum's **free** tier (see below) |
| **Walrus memories written** | grew past the 10-memory requirement during testing (23+) |

## Where the latency goes

A single auto-payment makes ~11 Tatum GraphQL calls (coin/gas reads for the tx builds, the execute
mutation, and the verify read) plus one Walrus recall. On the **free Tatum plan (3 requests/second)**
those calls are **serialized with a ~380 ms gap and retried on HTTP 429**, which is the dominant cost
— not the chain itself.

| Component (single sample) | Time |
|---|---|
| `getBalance` (one Tatum GraphQL call) | ~0.8 s |
| Walrus `recall` (3 semantic queries, sequential) | ~6.8 s |
| Rest (builds + simulate + execute + verify, rate-limited) | remainder of ~33 s |

## Optimization applied

The guard originally **rebuilt and re-simulated** the transaction inside `pay()` even for an
auto-pay that `evaluate()` had built milliseconds earlier (that re-check exists because a *human*
approval can be minutes stale). For immediate auto-pays we now **reuse the freshly-built, already
dry-run-matched** transaction. The exact-match safety check is unchanged.

| | Tatum calls / payment | Latency / payment | Reliability |
|---|---|---|---|
| Baseline (8 payments) | avg **15** (14–16) | avg **32.2 s** (27.8–36.0) | 8/8 |
| After reuse-prepared (4 payments) | avg **11** (10–12) | avg **33.4 s** (32.2–35.7) | 4/4 |

Fewer Tatum calls means less rate-limit pressure and lower credit burn; wall-clock stays similar
because the free-tier throttle still gates each remaining call.

> **Also tried and reverted:** firing the three Walrus recall queries in parallel. It made the
> *first* auto-pay's tail latency much worse (83 s) — the Walrus relayer rate-limits concurrent
> recalls — so recall is kept sequential for consistent, predictable latency.

## Conclusion

- **It works, reliably, for real money.** 12/12 live mainnet payments, each verified on-chain by the
  vendor, each decided by rules recalled from Walrus — including after the local store was wiped
  (portability test L7).
- **Cost is negligible:** the USDC price plus ~a tenth of a cent of gas. No facilitator spread.
- **Latency is bounded by the free Tatum tier, not the design.** The clear levers, in order:
  1. a **paid Tatum plan** (lifts the 3 req/s cap — the single biggest win),
  2. a short-lived **Walrus recall cache** per (vendor, endpoint) to skip recall on repeat auto-pays,
  3. a **gas-price + coin cache** to trim the per-build reads.

_Representative transactions (suiscan mainnet):_
`9yeQWKKRtu6pGkrDwKpK6F1uR6GzZppm1fJY5nQQPuTW`,
`AYBhd7KfZTK8nLXfVUAjmvbCZ58FT6ZYcCuJbnRYaYR9`, `9VhLoXqR…`.
All show −$0.01 USDC from the agent to the vendor, gas ~0.00142 SUI.
