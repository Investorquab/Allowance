# Allowance: giving an AI agent a spending allowance it can't blow

_Built for Total Recall (Tatum × Walrus), Track 02 — Smart Agents for Real Life._

> **Draft for publishing** (Medium / Mirror / dev.to / Hashnode). Drop in the four screenshots where
> marked. Repo: https://github.com/Investorquab/Allowance

---

## The problem: agents can pay now, and that's the scary part

Agents can now pay for things per request — an API call, a dataset, a compute job — over HTTP 402
and schemes like x402. That's powerful, and it leaves you with two bad options:

- **Hard caps only.** One bad prompt or a caching miss and you get a surprise bill. (People have
  woken up to [a $38k cloud bill from a single cache miss](https://news.ycombinator.com/item?id=47933355).)
- **Approve everything.** The agent pings you about every one-cent call until you stop reading and
  just tap yes — which is the same as approving everything.

Neither is how you'd hand money to a person you trust. You give them an **allowance**: pay for the
routine stuff yourself, check with me on anything unusual, and we both learn the rules as we go.

That's Allowance. It sits between your agent and the paid APIs it calls, and it treats every payment
the way a security team treats a multisig signature: **decode it, dry-run it, and refuse anything
that doesn't look exactly right** — before a single coin moves.

> _[screenshot: Overview — "Handled without you 83%", balance, the asks-per-day chart]_

## How it works

```
agent ──GET──▶ paid API ──402 { amount, payTo, USDC on Sui }──▶ agent
agent ──"may I pay?"──▶ ALLOWANCE
                          1. recall memories (Walrus)  → your rules, past approvals, known payees
                          2. Tatum Sui RPC             → balance, dry-run of the exact transaction
                          3. decide                    → PAY · ASK YOU · BLOCK  (with reasons + the memories it used)
        PAY ─▶ sign & send USDC (Tatum) ─▶ retry with X-PAYMENT ─▶ vendor verifies the tx (Tatum) ─▶ data
        ASK ─▶ your inbox ─▶ approve/deny (+ a rule in plain words) ─▶ new memories ─▶ next time it just knows
```

The decision is a pure function. In order: **hard caps** (which memory can never raise) → **your
rules** → **transaction checks** → **payee checks** → learned trust. Any one block means block.

## The checks: multisig security, applied to agent spending

The interesting part isn't "is there budget left." It's the checks borrowed from how people sign
high-value transactions:

- **Dry-run must match exactly.** Allowance builds the transaction and simulates it on Sui *before
  signing*. If the simulated balance change isn't precisely "−$0.01 USDC from me to this payee," it
  refuses. A vendor can't quietly inflate the amount or redirect funds.
- **Look-alike payee.** A scam vendor `datapu1se` (note the `1`) with a different address is blocked,
  not paid.
- **Payee changed / redirected invoice.** If a known vendor suddenly asks to be paid at a new
  address, that's a block, not an auto-pay.
- **Duplicate and price-spike** detection for repeated or suddenly-expensive calls.
- **Demo-attack guard (live):** the built-in "attack" scenarios can _never_ send real USDC to an
  address nobody controls, even if you run them first.

## Walrus Memory: the rules _are_ the product

Most "memory" demos use memory as a log. Here it's the policy. On every decision Allowance **recalls
from Walrus** — your rules, your past approvals, the payees it knows — and derives the policy fresh
from what comes back. Walrus is the source of truth; the local file is just a cache for fast UI.

When you approve a payment and add a note like _"auto-approve under 5 cents from them,"_ that becomes
three memories on Walrus mainnet: the decision, the payee, and a **rule**. Next time, the same vendor
auto-pays — no ask.

You can watch this happen: the **asks-per-day chart falls as the memories grow**. Day one, it asks
about everything. By the end of the week it's handling almost everything itself, and every auto-pay
cites the memory that justified it.

> _[screenshot: Memory tab — each fact tagged `walrus:<blob id>`]_

### The portability test (my favourite)

Memory on Walrus means memory that isn't trapped in one process. To prove it, I **deleted the entire
local database**, restarted, and sent the same request. It **auto-paid anyway** — because the rule
came back from Walrus, not from disk. The agent's judgment is portable: move it to another machine,
another agent, and it still knows your rules.

## Tatum: every on-chain action goes through the Sui gateway

Balance, coin selection, transaction dry-run, execute, and the vendor's verification all go through
**Tatum's Sui mainnet gateway**. One wrinkle worth sharing: part-way through, Sui **deprecated
JSON-RPC network-wide**, so Tatum's gateway now serves **GraphQL**. I ported the whole chain adapter
to `@mysten/sui`'s unified `SuiGraphQLClient` pointed at Tatum — the same code builds, simulates,
executes and reads transactions over GraphQL. (If you're building on Sui today: the JSON-RPC
tutorials are stale; use the gRPC or GraphQL clients.)

The free gateway caps at 3 requests/second, so the client serializes calls and retries on 429 — a
detail that matters once you measure real latency (below).

## Does it actually work? A mainnet field test

I ran it for real on Sui mainnet — real USDC, real transactions you can open on Suiscan.

| Metric | Result |
|---|---|
| **Reliability** | **12 / 12 live payments succeeded (100%)**, zero failures |
| **Cost — USDC** | exactly the price per call; no spread, no facilitator fee |
| **Cost — gas** | ~**0.00142 SUI per payment** (~a tenth of a cent) |
| **Latency** | ~**33 s per auto-payment** on Tatum's **free** tier |
| **Memories on Walrus** | 20+, all recalled correctly to drive decisions |

The honest finding: **reliability and cost are great; latency is bounded by the free tier, not the
design.** Each payment makes a burst of GraphQL calls that get serialized under the 3 req/s cap. The
clear levers are a paid Tatum plan and a short recall cache — not more code. I also shipped one
optimization along the way: reusing the already-dry-run-matched transaction for immediate auto-pays
cut Tatum calls from 15 to 11 per payment. (Full numbers in
[`FIELD-TEST.md`](https://github.com/Investorquab/Allowance/blob/main/FIELD-TEST.md).)

> _[screenshot: a Suiscan transaction — "Send −0.01 USDC", sender → vendor]_

## On the "agent payments" question

I checked with the organisers whether a self-run 402 vendor settling real Sui USDC counts for the
agent-payments bonus. The answer:

> _"There is no single mandated facilitator — you can implement standard HTTP 402 or an MPP-style
> paywall directly and settle/verify transactions through Tatum's Sui gateway."_

So Allowance implements the 402 flow end to end: the vendor issues the 402, the agent pays in USDC on
Sui, and the vendor **verifies the transaction on-chain through Tatum** before serving data.

## What's next

- **Approve from your phone** — a Telegram bot that pushes each ask to you with Approve/Deny buttons.
- **More chains** — settling the same 402 flow on Base (USDC via EIP-3009) so Allowance can guard the
  wider x402 ecosystem, not just our own vendor.

## Try it

- Code: **https://github.com/Investorquab/Allowance** (`README.md` for setup, `CHECKLIST.md` for the
  build, `FIELD-TEST.md` for the numbers)
- Sim mode runs offline with no keys — `ALLOWANCE_MODE=sim && npm run dev`, then "Simulate a week"
  and watch the asks fall.

_Built with Tatum (Sui mainnet RPC) and Walrus Memory. Thanks to the Total Recall organisers._
