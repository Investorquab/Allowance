# Allowance

**A spending guard for autonomous AI agents.** Allowance sits between your agent and the paid APIs it calls. It **pays for routine things itself, asks you about anything new or unusual, and blocks what looks wrong** — and it **learns your rules from every approve or deny**. Payments settle in **USDC on Sui mainnet**, every transaction is checked and verified through **Tatum's Sui RPC**, and what it learns is stored in **Walrus Memory** so your rules follow you to any agent or machine.

> **▶ Live on Sui mainnet:** https://allowance.185-7-81-139.sslip.io
> A deployed, public agent-payment service — its `/api/vendors/*` endpoints answer real HTTP `402 Payment Required` and settle USDC on Sui.

Built for **Total Recall (Tatum × Walrus)**, Track 02 *Smart Agents for Real Life* — also entered for *Best Walrus Memory* and *Best Use of Agent Payments*. Requirements tracked in [CHECKLIST.md](./CHECKLIST.md); mainnet latency/cost numbers in [FIELD-TEST.md](./FIELD-TEST.md).

---

## Why it exists

Agents can now pay for things per request — an API call, a dataset, a compute job — over HTTP 402 and schemes like x402. That's powerful, and it leaves you two bad options:

- **Hard caps only.** One bad prompt or a caching miss and you get a surprise bill ([a $38k Bedrock bill](https://news.ycombinator.com/item?id=47933355) from a single cache miss).
- **Approve everything.** The agent pings you about every one-cent call until you stop reading and just tap *yes* — which is the same as approving everything.

Neither is how you'd hand money to a person you trust. You give them an **allowance**: pay for the routine yourself, check with me on anything unusual, and we both learn the rules as we go. That's Allowance — and it treats every payment the way a security team treats a multisig signature: **decode it, dry-run it, and refuse anything that isn't exactly right, before a single coin moves.**

## What it does

- **Decides every payment** — `PAY` · `ASK YOU` · `BLOCK` — as a pure function with a clear, auditable reason trail.
- **Learns from your words.** Approve with a note like *"keep it under two bucks a day"* and Walrus `analyze()` turns it into an enforceable rule; next time, it just knows.
- **Remembers on Walrus, not on disk.** Rules, payees and past decisions live on Walrus mainnet — delete the local database and it *still* makes the right call, because memory is the source of truth.
- **Settles real USDC on Sui, verified via Tatum.** The agent pays; the vendor independently verifies the on-chain transfer through Tatum before serving data.
- **Guards real third-party APIs** — not just demo vendors (see *PriceWire*, which fronts live CoinGecko / Frankfurter data behind the Sui-settled 402).
- **Approvals from your phone** via a Telegram bot (`npm run telegram`): Approve/Deny buttons, `/status`, `/rules`, and a daily brief.
- **Shows its work.** Every decision lists the checks it ran and the exact memories it recalled. A "Memory switch" view decides the same payment *with* and *without* memory, side by side.

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

The decision is a **pure function** (`src/lib/guard/engine.ts#decide`). Order: **hard caps** (which memory can never raise) → **your rules** → **transaction checks** → **payee checks** → learned trust. Any one block means block; otherwise any ask means ask; otherwise pay.

### The checks — multisig security, applied to agent spending

| Check | Result | Why |
|---|---|---|
| Hard per-payment & daily caps | block | Set by you in env. **Memory can never raise them** |
| `never pay X` rule | block | You said so |
| **Dry-run mismatch** | block | The simulated transaction must move *exactly* the asked amount from you to the vendor — nothing else |
| **Look-alike pay-to address** | block | Same first/last characters as a known payee but a different address (address poisoning) |
| **Payee changed** | block | A known vendor suddenly wants paying at a new address (invoice redirect) |
| **Demo-attack guard (live)** | block | Built-in "attack" scenarios can *never* send real USDC to an unowned address, even if run first |
| Duplicate purchase | block | The agent already bought this exact thing within the hour |
| New payee, no on-chain history | ask | First contact |
| Price spike vs remembered norm | ask | More than 2× what you usually pay |
| Over budget / "ask above" rule | ask | Your words |
| **Learned trust** | pay | You approved this vendor+endpoint ≥ twice, or set "auto-approve under $X" |

### Learning — the rules *are* the product

Memories are append-only facts (decisions, payees, rules, notes), each written to Walrus as a readable sentence plus JSON. On every payment Allowance **recalls** the relevant memories and **derives** the policy fresh from them — so Walrus is the policy, not just a log, and every decision traces back to the memories behind it.

Plain-language notes become rules, via a deterministic parser widened by **Walrus `analyze()`** (so loose phrasing still works, while hard caps stay untouchable):

| You type | Becomes |
|---|---|
| "auto-approve under 5 cents from them" | `auto_ok_under $0.05` for that vendor |
| "ask me above $0.20" | `always_ask_above $0.20` |
| "never pay them again" | `never_pay` for that vendor |
| "keep it under two bucks a day" | `daily_budget $2` (extracted by `analyze()`) |

Denying a price spike doesn't revoke trust for normal prices — you said no to the spike, not the vendor.

## Tatum & Walrus integration

**Tatum Sui RPC** (`src/lib/chain/tatum.ts`) — everything on-chain goes through Tatum's Sui **mainnet gateway**. Sui deprecated JSON-RPC network-wide mid-build, so the adapter uses `@mysten/sui`'s unified **`SuiGraphQLClient`** pointed at Tatum (`…/graphql`, `x-api-key`):

| Via `SuiGraphQLClient` | Used for |
|---|---|
| `getReferenceGasPrice` | Gas price (health + preflight) |
| `getBalance` / `listBalances` | Can the agent afford it? + real portfolio data for the Chainlens API |
| `tx.build({ client })` | Coin selection & gas, over GraphQL |
| `simulateTransaction` | **Exact dry-run** before signing |
| `executeTransaction` | Send the USDC (GraphQL mutation) |
| `getTransaction` / `waitForTransaction` | Vendor-side payment verification (the "facilitator" step on Sui) |

**Walrus Memory** (`src/lib/memory/store.ts`):

- `rememberAndWait` for rules, payees and human decisions (returns a Walrus blob id, shown in the UI); `remember` (no-wait) for Allowance's own low-stakes logs so payments aren't delayed.
- `recall` with semantic queries before each payment (rules recalled newest-first so an updated rule wins).
- `analyze` to extract structured rules from free-text notes.
- `rebuild` (the **"Sync from Walrus"** button) repopulates the local mirror from `listMemories()` — proving portability.

## Multi-chain settlement

Allowance's guard is **chain-agnostic**: the engine, the 402 flow and the dry-run semantics don't care which chain settles. Settlement lives behind a single `ChainAdapter` interface (`src/lib/chain/adapter.ts`):

- **Sui mainnet via Tatum** (`chain/tatum.ts`) — the live, production path.
- **Base / EVM via viem** (`chain/base-evm.ts`) — an **experimental, off-by-default** second settlement chain (USDC on Base), implementing the same interface, with offline unit tests. The public x402 ecosystem is largely on Base, so this is the bridge to guarding native x402 APIs. Not live-verified yet — enable with a funded Base wallet via `baseEvmFromEnv()`.

## For reviewers — what to see, do, and check

**Fastest look (≈2 minutes, no keys, fully offline):**

```bash
npm install && npm test        # 51 tests, incl. a full simulated week
npm run dev                    # http://localhost:3000  (ALLOWANCE_MODE=sim)
```
In the UI: **Try it → Reset sim data → Simulate a week.** Watch the **asks-per-day chart fall 3 → 0** as memories grow. Then **Try it → Scam: look-alike "DataPulse"** (blocked) and **Real API: SUI spot price (PriceWire)**. Open any **Activity** row to see the **checks** and the **memories it recalled**.

**Live proof (the deployed service):**

```bash
curl -i "https://allowance.185-7-81-139.sslip.io/api/vendors/pricewire/spot?token=sui"
# → HTTP 402 with network "sui:mainnet", a USDC payTo, and a nonce — a real paywall on the public internet
curl -s https://allowance.185-7-81-139.sslip.io/api/health   # { ok, tatum, walrus, agent }
```
A real mainnet payment opens on [suiscan](https://suiscan.xyz/mainnet) (e.g. digest `9yeQWKKRtu6pGkrDwKpK6F1uR6GzZppm1fJY5nQQPuTW`), showing −USDC from the agent → vendor, with a *"✓ verified by vendor"* badge.

**Where each judging criterion lives:**

| Criterion | What to check | Where |
|---|---|---|
| **Walrus & Tatum integration** | Memory *drives* decisions (not a log); 8+ distinct Sui RPC calls through Tatum | `memory/store.ts`, `guard/policy.ts`, `chain/tatum.ts` |
| **Technical quality** | Pure decision engine, typed core, 51 tests, clean adapters, GraphQL port | `guard/engine.ts`, `test/`, `chain/` |
| **Creativity** | Multisig-style checks (exact dry-run, look-alike & payee-change detection) applied to agent payments; a real API guarded by a 402 | `guard/engine.ts`, `vendors.ts`, `vendor-server.ts` |
| **Presentation** | This README, the learning chart, the Memory-switch view, the demo video | UI + the live app |

> **The portability test (worth a look):** stop the server, delete `.data/allowance-live.json`, restart, and send a known request. It **still auto-pays** — because the rule came back from Walrus, not from disk.

## Running it

```bash
npm install
cp .env.example .env.local      # sim mode works with no keys
npm run dev                     # http://localhost:3000
npm test                        # 51 tests, including a full simulated week
```

**Sim mode** is fully offline — a simulated Sui ledger and local memory, the same code paths otherwise. Use it to build and rehearse.

**Live mode (Sui mainnet):**

1. Fill `.env.local`: your Tatum key; a fresh agent wallet with a little SUI for gas and ~$2 USDC; a vendor wallet address; your Walrus Memory delegate key and account id. **Never commit `.env.local` or paste keys anywhere.**
2. `npm run check:live` — verifies Tatum, wallet balances, and a Walrus write + recall.
3. Set `ALLOWANCE_MODE=live` and `npm run dev`.
4. **Simulate a week** writes 30+ memories to Walrus mainnet and makes ~30 real micro-payments (~$0.75 total).

See [DEPLOY.md](./DEPLOY.md) to run it on your own server (Docker or pm2 + a reverse proxy).

## Use it from your own agent

Point your agent at Allowance instead of letting it pay 402s directly. One call decides and (if your rules allow) pays — settling USDC on Sui and verifying via Tatum:

```js
const res = await fetch("https://your-allowance/api/agent/run", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
  body: JSON.stringify({
    task: "why I need this",                                   // shown to the human if it has to ask
    path: "/api/vendors/chainlens/wallet-report?address=0x…",  // any 402 resource on this host
  }),
});
const out = await res.json();
// out.status: "paid" (auto, with the data) · "pending" (asked you) · "blocked" · "free"
```

The rules that drive these decisions live in **Walrus**, so they follow the agent to any machine.

## Project layout

```
src/lib/x402.ts            402 protocol (requirements, X-PAYMENT, verify)
src/lib/guard/             engine (decide), policy (derive from memories), learn (notes → rules), index (orchestration)
src/lib/chain/             adapter (interface), tatum.ts (Sui live), sim.ts (offline), base-evm.ts (Base, experimental)
src/lib/memory/            Walrus + local adapters, fact text format
src/lib/vendor-server.ts   the paid API (seller side) + real upstream fetch (PriceWire)
src/lib/agent.ts           the buyer agent
src/app/api/*              HTTP routes
src/components/Dashboard   UI
```

## Honest notes

- There's no mandated x402/MPP facilitator on Sui. The organisers confirmed a standard HTTP 402 paywall, settled and verified through Tatum's Sui gateway, is the intended approach — and that's what this app does.
- The demo vendors are run by this app so the demo is repeatable; **PriceWire** fronts genuinely external APIs, and Chainlens serves real Tatum data in live mode.
- The JSON store is single-process (fine for one instance with a persistent disk; not Vercel serverless). Base/EVM settlement is scaffolded but not yet live-verified.
- The default Walrus relayer sees memory plaintext; use `MemWalManual` or a self-hosted relayer if that matters to you.

_Built with Tatum (Sui mainnet RPC) and Walrus Memory._
