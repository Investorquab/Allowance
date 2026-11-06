# Allowance

**Your AI agent's spending allowance.** It pays for routine things by itself, asks you about anything new or unusual, and **learns your rules from every approve or deny**. Each payment settles in **USDC on Sui mainnet** and is checked through **Tatum's Sui RPC**. What it learns is stored in **Walrus Memory**, so your rules follow you to any agent.

Built for **Total Recall (Tatum × Walrus)**, Track 02 *Smart Agents for Real Life*. Also entered for *Best Walrus Memory* and *Best Use of Agent Payments*. The requirements are tracked in [CHECKLIST.md](./CHECKLIST.md).

## The problem

Agents can now pay for APIs per request (x402, MPP). That leaves you two bad options:

- **Hard caps only.** One bad prompt or caching miss and you get a surprise bill ([a $38k Bedrock bill](https://news.ycombinator.com/item?id=47933355) from a single cache miss).
- **Approve everything.** The agent asks about every 1-cent call, so you stop reading and click yes.

Allowance sits in between. Its rules come from *your own decisions*, and it treats every payment the way security teams treat multisig signing: **decode and dry-run before signing**.

## How it works

```
agent ──GET──▶ paid API ──402 {amount, payTo, USDC on Sui}──▶ agent
agent ──"may I pay?"──▶ ALLOWANCE
                          1. recall memories (Walrus)  → your rules, past approvals, known payees
                          2. Tatum Sui RPC             → balance, payee history, dry-run of the exact tx
                          3. decide                    → PAY · ASK YOU · BLOCK   (with reasons + memories cited)
        PAY ─▶ sign & send USDC (Tatum) ─▶ retry with X-PAYMENT ─▶ vendor verifies digest via Tatum ─▶ data
        ASK ─▶ inbox ─▶ you approve/deny (+ optional rule in plain words) ─▶ new memories ─▶ next time it knows
```

### Checks (in `src/lib/guard/engine.ts`)

| Check | Result | Why |
|---|---|---|
| Hard per-payment and daily caps | block | Set by you in env. Memory can never raise them |
| `never pay X` rule | block | You said so |
| **Dry-run mismatch** | block | The simulated transaction must move *exactly* the asked amount from you to the vendor, and nothing else |
| **Look-alike pay-to address** | block | Same first and last characters as a known payee but a different address (address poisoning) |
| **Payee changed** | block | A known vendor suddenly wants paying at a new address (invoice redirect) |
| Duplicate purchase | block | The agent already bought this exact thing within the hour |
| New payee with no onchain history | ask | First contact |
| Price spike vs remembered norm | ask | More than 2× what you usually pay |
| Over your budget or "ask above" rule | ask | Your words |
| **Learned trust** | pay | You approved this vendor and endpoint at least twice, or set "auto-approve under $X" |

### Learning (`src/lib/guard/learn.ts`, `policy.ts`)

Memories are append-only facts: decisions, payees, rules and notes. Each one is written to Walrus as a readable sentence followed by JSON. On every payment, Allowance **recalls** the relevant memories and **derives** the policy from them. That means every decision can be traced to the memories behind it, and the UI shows which ones were used.

Notes you type become rules:

- "auto-approve under 5 cents from them" → `auto_ok_under $0.05` for that vendor
- "ask me above $0.20" → `always_ask_above $0.20`
- "never pay them again" → `never_pay` for that vendor
- "keep it under $2 a day" → `daily_budget $2`

Denying a price spike doesn't revoke trust for normal prices: you said no to the spike, not to the vendor.

## Tatum and Walrus usage

**Tatum Sui RPC** (`src/lib/chain/tatum.ts`, mainnet gateway):

| Call | Used for |
|---|---|
| `suix_getBalance` | Can the agent afford it? |
| `suix_queryTransactionBlocks` | Payee history (is this address new?) and recent activity for wallet reports |
| `sui_dryRunTransactionBlock` | Exact simulation before signing |
| `sui_executeTransactionBlock` | Send the USDC |
| `sui_getTransactionBlock` | Vendor-side payment verification (x402 "facilitator" on Sui) |
| `suix_getAllBalances` | The Chainlens paid API serves real portfolio data |

The transaction builder (`@mysten/sui`) also resolves coins and gas through the same Tatum endpoint.

**Walrus Memory** (`src/lib/memory/store.ts`):

- `rememberAndWait` for every decision, payee and rule (returns a Walrus blob id, shown in the UI)
- `recall` with three semantic queries before each payment

## Running it

```bash
npm install
cp .env.example .env.local      # sim mode works with no keys
npm run dev                     # http://localhost:3000
npm test                        # 25 tests, including a full simulated week
```

**Sim mode** is fully offline: a simulated Sui ledger and local memory, the same code paths otherwise. Use it to build and rehearse.

**Live mode (required for the hackathon):**

1. Fill `.env.local` with:
   - your Tatum key
   - a fresh agent wallet holding a little SUI for gas and about $2 USDC
   - a vendor wallet address
   - your Walrus Memory key and account

   Never commit `.env.local` or paste keys anywhere.
2. Run `npm run check:live`. It checks Tatum, the wallet balances, and a Walrus write and recall.
3. Set `ALLOWANCE_MODE=live` and run `npm run dev`.
4. **Simulate a week** writes 30+ memories to Walrus mainnet and makes about 30 real micro-payments (around $0.75 total).

### Demo scenarios ("Try it" tab)

- Routine purchase
- Price spike
- Look-alike "DataPulse" scam vendor
- Redirected invoice
- Expensive report

The "Simulate a week" button produces the learning chart: asks per day fall from 3 to 0.

## Project layout

```
src/lib/x402.ts            402 protocol (requirements, X-PAYMENT, verify)
src/lib/guard/             engine (decide), policy (derive from memories), learn (notes → rules), index (orchestration)
src/lib/chain/             tatum.ts (live), sim.ts (offline)
src/lib/memory/            Walrus + local adapters, fact text format
src/lib/vendor-server.ts   the paid API (seller side)
src/lib/agent.ts           the buyer agent
src/app/api/*              HTTP routes
src/components/Dashboard   UI
```

## Honest notes

- I couldn't find an x402 or MPP facilitator that settles on Sui, so this app runs its own verification step through Tatum. It's the same 402 flow, settled in USDC on Sui.
- The vendors are run by this app so the demo is repeatable. Chainlens serves real Tatum data in live mode.
- The default Walrus relayer sees memory plaintext. Use `MemWalManual` or a self-hosted relayer if that matters to you.
