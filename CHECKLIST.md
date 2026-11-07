# Allowance: Total Recall checklist

**Deadline: Tue 10 Nov 2026, 17:00 UTC (6:00 PM Lagos).** Tick items as you go: `- [ ]` → `- [x]`.

Allowance gives your AI agent a spending allowance. It pays routine bills itself, asks you about anything unusual, and learns your rules from every approve or deny (stored in Walrus Memory). It settles in USDC on Sui mainnet and checks everything through Tatum's Sui RPC.

> **Status as of 2026-11-07:** Live mode works end to end on Sui mainnet. The Tatum adapter was ported from the dead JSON-RPC API to Tatum's GraphQL gateway. Live tests **L1–L10 all pass** (first real payment, 10+ Walrus memories, portability). Code committed and pushed to https://github.com/Investorquab/Allowance. **Remaining for eligibility: blog post, demo video, X post, and the form (needs Tatum account ID + `MEMWAL_AGENT_ID`).**

---

## A. Hard requirements (miss one = not eligible)

Source: the event page's "What to deliver" checklist and FAQ.

- [x] **Walrus Memory integrated and writing on Mainnet**: `MEMWAL_*` env set, `ALLOWANCE_MODE=live`, writes visible in the Memory dashboard — `check:live` writes + recalls; 11 memories with `walrus:<blob>` ids
- [x] **At least 10 memories stored on Mainnet**: **11 memories on Walrus mainnet** (namespace `allowance`), confirmed in the dashboard Memory tab
- [x] **Tatum RPC used for onchain data**: balance, coin selection, dry-run (simulate), execute, verify and gas price all go through `sui-mainnet.gateway.tatum.io/graphql` (payee-history degrades gracefully — the gateway has no incoming-tx filter)
- [ ] **Published blog post** covering: what it does, how it uses Tatum and Walrus, **how it learned over time** (use the "asks per day" chart)
- [ ] **Working demo** (video, 2–3 min)
- [x] **Public repo** with a clear README — https://github.com/Investorquab/Allowance (README covers problem, how-it-works, checks, setup)
- [ ] Submission form fields ready:
  - [ ] Tatum dashboard **account ID** (get from dashboard.tatum.io)
  - [ ] `MEMWAL_AGENT_ID`: the public key under *Delegate keys* in the Memory dashboard
  - [x] Repo URL — https://github.com/Investorquab/Allowance · [ ] demo URL or video · [ ] blog URL
- [ ] Submitted before **10 Nov 17:00 UTC**

## B. Prizes we're targeting

| Prize | Amount | What makes us qualify | Status |
|---|---|---|---|
| Track 02 Smart Agents for Real Life | $500 / $300 / $200 | An agent that watches spending and remembers your rules across sessions | [x] qualifies |
| Best Walrus Memory | $500 | "Memories that visibly change the product": the asks-per-day chart falls as memories grow, and each decision shows which memories drove it | [x] qualifies |
| Best Use of Agent Payments | $500 | x402-style 402 flow, **settled in USDC on Sui**, payment verified through Tatum | [x] proven live (L4 tx on suiscan) |
| Social bonus (judging points) | — | Post on X/LinkedIn tagging @Tatum_io and @WalrusFoundation | [ ] |

- [x] **Asked in Tatum Discord** whether a self-run 402 vendor with real Sui USDC settlement counts for the Agent Payments bonus. Admin reply: *"There is no single mandated facilitator, you can implement standard HTTP 402 or an MPP style paywall directly and settle/verify transactions through Tatum's Sui gateway."* → **our design qualifies as is.**

## C. Judging criteria and how we score

- [x] **30% Walrus & Tatum integration**: memory decides payments (not just a log), and Tatum is used for 6+ different Sui RPC calls (gas price, balance, list balances, list coins, simulate, execute, get transaction, wait-for-transaction)
- [x] **30% Technical quality**: typed core, 38 unit tests passing (`npm test`), clean adapters, mainnet Sui RPC working over GraphQL, typecheck + build clean
- [x] **20% Creativity**: the payment checks borrowed from multisig security (dry-run must match exactly, payee-changed and look-alike detection, live demo-attack block), applied to agent payments
- [ ] **20% Presentation**: README ✅, demo video ⏳, blog post ⏳

---

## D. Hour-1 checks (do these before anything else)

- [x] Create a Tatum account and get the API key *(the JSON-RPC curl in the original note now 404s — Sui deprecated JSON-RPC; the key works against the GraphQL gateway, verified by `check:live`)*
- [x] Create a Walrus Memory account and delegate key at memory.walrus.xyz → in `.env.local`
- [x] Run `npm run check:live` → health OK, one memory written and recalled (all green)
- [x] Confirm the **USDC coin type on Sui mainnet** in `.env.local` (`USDC_COIN_TYPE`) — agent holds exactly this coin type on mainnet
- [x] Fund the **agent wallet** with a little SUI (gas) and about $2 USDC on Sui mainnet — 0.59 SUI + ~$1.65 USDC
- [x] Set a **separate vendor wallet** address (`VENDOR_SUI_ADDRESS`) — payments move between two addresses (confirmed on suiscan: sender ≠ recipient)

## E. Build checklist

### Core (done in the scaffold; tick when you've reviewed or run it)
- [x] 402 payment protocol: `src/lib/x402.ts` (requirements → `X-PAYMENT` header → verify)
- [x] Guard engine: `src/lib/guard/engine.ts` (hard caps → user rules → payment checks → learned trust → decision)
- [x] Checks: daily cap, per-payment cap, balance, **dry-run must match exactly**, new payee, **payee changed**, **look-alike address**, duplicate request, price spike, **live demo-attack block (A2)**
- [x] Learning: `src/lib/guard/learn.ts` (each approve/deny becomes a memory; a note like "always ok under $0.05" becomes a rule)
- [x] Memory adapters: Walrus (live) and local file (sim)
- [x] Chain adapters: Tatum Sui **GraphQL** (live) and simulated ledger (sim)
- [x] Unit tests pass: `npm test` (38 passing)

### App
- [x] Vendor API (real, Tatum-backed): `/api/vendors/[vendor]/[endpoint]`
- [x] Agent runner: `/api/agent/run`
- [x] Dashboard: Overview, Inbox, Activity, Memory, Morning brief, Rules
- [x] "Simulate a week" demo shows asks dropping day by day (week test: asks 3 1 0 1 1 0 0)

### Going live (mainnet)
- [x] `ALLOWANCE_MODE=live` and all env set
- [x] One real payment end to end; tx digest opens on suiscan.xyz (`9yeQWKKR…` and others)
- [x] Vendor verifies the payment through Tatum (`getTransaction` over GraphQL) — "✓ verified by vendor" badge
- [x] 10+ memories visible in the Walrus Memory dashboard (11)
- [x] Screenshot the dashboard and the memories for the blog (Overview, Activity, Memory, suiscan tx)

### Stretch (only if time allows)
- [ ] Telegram or Discord approvals (reply approve or deny from your phone)
- [ ] Guard a real third-party x402 API (shows Allowance works with outside vendors)
- [ ] Use Walrus `analyze()` to turn free-text notes into rules
- [ ] Deploy (Railway or Fly, which need a persistent disk for `.data/`) for a live URL
- [ ] Mainnet field-test report: latency, Tatum call counts, 429s, gas cost per payment

## F. Submission assets
- [x] README: problem, how it works, how Tatum and Walrus are used, setup, demo
- [ ] Blog post (Medium, Mirror, dev.to or Hashnode), including the learning chart and the Tatum + Walrus sections
- [ ] Demo video, 2–3 min:
  1. Day 1: everything asks
  2. Approve a few with notes
  3. Simulate the week, and asks drop
  4. A look-alike payee is blocked
  5. A real mainnet payment and its suiscan link
  6. The memories that drove each decision
- [ ] X post tagging @Tatum_io and @WalrusFoundation
- [ ] Form submitted ✅
