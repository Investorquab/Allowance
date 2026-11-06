# Allowance: Total Recall checklist

**Deadline: Tue 10 Nov 2026, 17:00 UTC (6:00 PM Lagos).** Tick items as you go: `- [ ]` → `- [x]`.

Allowance gives your AI agent a spending allowance. It pays routine bills itself, asks you about anything unusual, and learns your rules from every approve or deny (stored in Walrus Memory). It settles in USDC on Sui mainnet and checks everything through Tatum's Sui RPC.

---

## A. Hard requirements (miss one = not eligible)

Source: the event page's "What to deliver" checklist and FAQ.

- [ ] **Walrus Memory integrated and writing on Mainnet**: `MEMWAL_*` env set, `ALLOWANCE_MODE=live`, writes visible in the Memory dashboard
- [ ] **At least 10 memories stored on Mainnet**: run the demo week (`Simulate a week` button), then confirm the count in memory.walrus.xyz
- [ ] **Tatum RPC used for onchain data**: every balance, payee-history, dry-run, execute and verify call goes through `sui-mainnet.gateway.tatum.io`
- [ ] **Published blog post** covering: what it does, how it uses Tatum and Walrus, **how it learned over time** (use the "asks per day" chart)
- [ ] **Working demo** (video, 2–3 min)
- [ ] **Public repo** with a clear README
- [ ] Submission form fields ready:
  - [ ] Tatum dashboard **account ID**
  - [ ] `MEMWAL_AGENT_ID`: the public key under *Delegate keys* in the Memory dashboard
  - [ ] Repo URL, demo URL or video, blog URL
- [ ] Submitted before **10 Nov 17:00 UTC**

## B. Prizes we're targeting

| Prize | Amount | What makes us qualify | Status |
|---|---|---|---|
| Track 02 Smart Agents for Real Life | $500 / $300 / $200 | An agent that watches spending and remembers your rules across sessions | [ ] |
| Best Walrus Memory | $500 | "Memories that visibly change the product": the asks-per-day chart falls as memories grow, and each decision shows which memories drove it | [ ] |
| Best Use of Agent Payments | $500 | x402-style 402 flow, **settled in USDC on Sui**, payment verified through Tatum | [ ] |
| Social bonus (judging points) | — | Post on X/LinkedIn tagging @Tatum_io and @WalrusFoundation | [ ] |

- [ ] **Ask in Tatum Discord** whether a self-run 402 vendor with real Sui USDC settlement counts for the Agent Payments bonus (no x402/MPP facilitator for Sui was found). Paste their answer here: ______

## C. Judging criteria and how we score

- [ ] **30% Walrus & Tatum integration**: memory decides payments (not just a log), and Tatum is used for 6 different Sui RPC calls
- [ ] **30% Technical quality**: typed core, unit tests passing (`npm test`), clean adapters, mainnet Sui RPC working
- [ ] **20% Creativity**: the payment checks borrowed from multisig security (dry-run must match exactly, payee-changed and look-alike detection), applied to agent payments
- [ ] **20% Presentation**: README, a demo video with a clear story, blog post

---

## D. Hour-1 checks (do these before anything else)

- [ ] Create a Tatum account and get the API key, then: `curl -s -H "x-api-key: $TATUM_API_KEY" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"suix_getReferenceGasPrice","params":[]}' https://sui-mainnet.gateway.tatum.io` → returns a number
- [ ] Create a Walrus Memory account and delegate key at memory.walrus.xyz → put them in `.env.local`
- [ ] Run `npm run check:live` → health OK, one memory written and recalled
- [ ] Confirm the **USDC coin type on Sui mainnet** in `.env.local` (`USDC_COIN_TYPE`) against Circle's or Sui's docs
- [ ] Fund the **agent wallet** with a little SUI (gas) and about $2 USDC on Sui mainnet
- [ ] Set a **separate vendor wallet** address (`VENDOR_SUI_ADDRESS`), so payments really move between two addresses

## E. Build checklist

### Core (done in the scaffold; tick when you've reviewed or run it)
- [ ] 402 payment protocol: `src/lib/x402.ts` (requirements → `X-PAYMENT` header → verify)
- [ ] Guard engine: `src/lib/guard/engine.ts` (hard caps → user rules → payment checks → learned trust → decision)
- [ ] Checks: daily cap, per-payment cap, balance, **dry-run must match exactly**, new payee, **payee changed**, **look-alike address**, duplicate request, price spike
- [ ] Learning: `src/lib/guard/learn.ts` (each approve/deny becomes a memory; a note like "always ok under $0.05" becomes a rule)
- [ ] Memory adapters: Walrus (live) and local file (sim)
- [ ] Chain adapters: Tatum Sui RPC (live) and simulated ledger (sim)
- [ ] Unit tests pass: `npm test`

### App
- [ ] Vendor API (real, Tatum-backed): `/api/vendors/[vendor]/[endpoint]`
- [ ] Agent runner: `/api/agent/run`
- [ ] Dashboard: Overview, Inbox, Activity, Memory, Morning brief, Rules
- [ ] "Simulate a week" demo shows asks dropping day by day

### Going live (mainnet)
- [ ] `ALLOWANCE_MODE=live` and all env set
- [ ] One real payment end to end; tx digest opens on suiscan.xyz
- [ ] Vendor verifies the payment through Tatum (`sui_getTransactionBlock`)
- [ ] 10+ memories visible in the Walrus Memory dashboard
- [ ] Screenshot the dashboard and the memories for the blog

### Stretch (only if time allows)
- [ ] Telegram or Discord approvals (reply approve or deny from your phone)
- [ ] Guard a real third-party x402 API on Base (shows Allowance works with outside vendors)
- [ ] Use Walrus `analyze()` to turn free-text notes into rules
- [ ] Deploy (Railway or Fly, which need a persistent disk for `.data/`) for a live URL

## F. Submission assets
- [ ] README: problem (agents overspend, or ask about everything), how it works, how Tatum and Walrus are used, setup, demo
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
