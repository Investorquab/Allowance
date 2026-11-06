# Allowance: handoff for Claude Code

The complete guide to continuing Allowance on your own machine. It covers where to get every key and where it goes, a full audit, a full test plan, and the submission steps.

**Deadline: Tue 10 Nov 2026, 17:00 UTC (6:00 PM Lagos).** Requirements tracker: [CHECKLIST.md](./CHECKLIST.md).

---

## 0. Status when handed off

| Area | State |
|---|---|
| Core guard (decide, learn, policy) | ✅ Built, 25 tests passing |
| 402 paywall + vendor verification | ✅ Built, tested in sim |
| Sim mode (offline ledger + local memory) | ✅ Works end to end, including "Simulate a week" |
| Dashboard (Overview, Inbox, Activity, Memory, Try it) | ✅ Built, checked at desktop and phone width |
| Production build, typecheck, lint | ✅ Clean (lint shows `any` warnings only) |
| **Live mode: Tatum Sui RPC on mainnet** | ⚠️ **Code written, never run.** The build sandbox had no network access to Sui |
| **Live mode: Walrus Memory on mainnet** | ⚠️ **Code written, never run** |
| Organiser confirmation for the payments bonus | ✅ "Implement standard HTTP 402… settle/verify through Tatum's Sui gateway". That is our design |

**Main job now:** get live mode working (§1–§2), fix the P0 and P1 audit items (§4), then run the live tests (§5.3).

---

## 1. Getting the keys, and where each one goes

Every value goes in **`.env.local`** in the repo root. Create it with `cp .env.example .env.local`. The file is gitignored.

> 🔒 **Safety rules.** Never paste a private key, seed phrase or API secret into any chat, including Claude Code. Type keys straight into `.env.local` in your editor. Never commit `.env.local`. If a key ever leaks, rotate it straight away (move the funds and make a new wallet, or regenerate the API key). Use a **fresh wallet with only a few dollars** for the agent.

### 1.1 Tatum API key → `TATUM_API_KEY`
1. Go to **https://dashboard.tatum.io/** and sign up (free).
2. Create or copy an **API key**. It should be a **mainnet** key, since the free plan has mainnet and testnet keys.
3. Put it in `.env.local` as `TATUM_API_KEY=t-...`
4. **Also note your Tatum *account ID*** (shown in the dashboard). The submission form asks for it. Write it in CHECKLIST §A.
5. Test it from a terminal (replace `$KEY`):
   ```bash
   curl -s -H "x-api-key: $KEY" -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"suix_getReferenceGasPrice","params":[]}' \
     https://sui-mainnet.gateway.tatum.io
   ```
   Expect `{"jsonrpc":"2.0","result":"<number>",...}`. If you get 401 or 403, the key or header is wrong. Check Tatum's docs for the header name; our code sends `x-api-key`.
6. Leave `SUI_RPC_URL=https://sui-mainnet.gateway.tatum.io`.

### 1.2 Walrus Memory → `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`
1. Go to **https://memory.walrus.xyz/dashboard** and sign in.
2. Create a **Walrus Memory account/agent**. Copy its **account ID** (a Sui object ID, `0x…`) into `MEMWAL_ACCOUNT_ID`.
3. Under **Delegate keys**, create a delegate key:
   - The **private key** (Ed25519, hex) goes into `MEMWAL_PRIVATE_KEY`.
   - The **public key** is your **`MEMWAL_AGENT_ID`** for the submission form. Write it in CHECKLIST §A.
   - If the dashboard only shows a public key, generate a pair with the SDK (`generateDelegateKey()` from `@mysten-incubation/memwal/account`) and register it with `addDelegateKey`. See docs.wal.app/walrus-memory/sdk/api-reference.
4. Leave `MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz` (mainnet relayer).
5. Set `MEMWAL_NAMESPACE=allowance`. Change it (for example to `allowance-v2`) whenever you want a clean slate, because mainnet memories can't be deleted from the app.
6. Docs: https://docs.wal.app/walrus-memory (quick start, configuration, SDK reference).

### 1.3 Agent wallet (the payer) → `AGENT_SUI_PRIVATE_KEY`
1. Create a **brand-new** Sui wallet, used only for this project. Either:
   - **Sui CLI:** run `sui client new-address ed25519`, then `sui keytool export --key-identity <address>` to get the `suiprivkey1…` string.
   - **Slush (the Sui wallet):** create an account, then go to Settings → export private key (`suiprivkey1…`).
2. Put the `suiprivkey1…` string in `AGENT_SUI_PRIVATE_KEY`.
3. Fund it on **Sui mainnet** with:
   - about **0.5 SUI** for gas (plenty for ~100 transactions)
   - about **$2 of native USDC on Sui**. Withdraw from an exchange that supports USDC on the Sui network, or swap SUI→USDC in a Sui DEX.

### 1.4 Vendor wallet (the payee) → `VENDOR_SUI_ADDRESS`
- Create a **second** wallet you control and put only its **address** (`0x…`, 64 hex) here. Don't put its private key anywhere.
- Optional: a third address in `VENDOR2_SUI_ADDRESS`, so "DataPulse" has its own payee. It defaults to the same address.

### 1.5 USDC coin type → `USDC_COIN_TYPE`
- The default is `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`.
- **Verify it** before going live: open your agent wallet on **https://suiscan.xyz/mainnet** after funding, and copy the exact coin type of the USDC you hold. If it differs, update the env.

### 1.6 Switch to live
```bash
npm run check:live          # every line should show ✅
# then in .env.local:
ALLOWANCE_MODE=live
npm run dev                 # http://localhost:3000
```

### 1.7 Full `.env.local` reference

| Variable | Required for live | Where it comes from |
|---|---|---|
| `ALLOWANCE_MODE` | ✅ (`live`) | You |
| `ALLOWANCE_BASE_URL` | ✅ | `http://localhost:3000`, or your deploy URL |
| `TATUM_API_KEY` | ✅ | dashboard.tatum.io |
| `SUI_RPC_URL` | default ok | Tatum Sui mainnet gateway |
| `AGENT_SUI_PRIVATE_KEY` | ✅ | New wallet (§1.3) |
| `VENDOR_SUI_ADDRESS` | ✅ | Second wallet address (§1.4) |
| `VENDOR2_SUI_ADDRESS` | optional | Third wallet address |
| `USDC_COIN_TYPE` | ✅ verify | suiscan (§1.5) |
| `MEMWAL_PRIVATE_KEY` | ✅ | memory.walrus.xyz delegate key (§1.2) |
| `MEMWAL_ACCOUNT_ID` | ✅ | memory.walrus.xyz (§1.2) |
| `MEMWAL_SERVER_URL` | default ok | Mainnet relayer |
| `MEMWAL_NAMESPACE` | default ok | Change for a clean slate |
| `HARD_PER_PAYMENT` / `HARD_DAILY` | default ok | $1.00 per payment / $5.00 per day (USDC base units) |
| `LEARN_AFTER_APPROVALS` | default ok | 2 |

---

## 2. Run it

```bash
npm install
npm test            # 25 tests (vitest)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (warnings ok, 0 errors expected)
npm run build       # next build
npm run dev         # http://localhost:3000
npm run check:live  # live-mode preflight (needs .env.local)
```

Node 22+ is required (`--env-file` is used by `check:live`). The repo uses **Next.js 16.4** (App Router, `cacheComponents: true`). Read `node_modules/next/dist/docs/` before changing routing or caching, because APIs differ from older Next versions (see `AGENTS.md`).

---

## 3. Architecture map

```
src/lib/
  types.ts            PaymentRequirement, PaymentRequest, Fact, Decision, …
  config.ts           env → config; mode sim|live; hard limits; fmtUsd/toUnits
  x402.ts             402 body, X-PAYMENT encode/decode, X-PAYMENT-RESPONSE
  store.ts            JSON file DB (.data/allowance-<mode>.json): requests, decisions, activity, facts mirror, sim ledger
  services.ts         picks adapters by mode (TatumSuiChain+WalrusMemory | SimChain+LocalMemory)
  chain/adapter.ts    ChainAdapter interface
  chain/tatum.ts      LIVE: Tatum JSON-RPC client + tx build/sign/execute/verify (@mysten/sui 2.x)
  chain/sim.ts        SIM: offline ledger with the same interface
  memory/facts.ts     Fact ⇄ "[allowance:v1] readable sentence ::json:: {…}"
  memory/store.ts     LocalMemory (keyword recall) + WalrusMemory (rememberAndWait / recall)
  guard/policy.ts     recalled memories → derived policy (learned limit, rules, known payees, price norm)
  guard/engine.ts     decide(): pure function, all checks, pay|ask|block
  guard/learn.ts      human answer + note → facts (decision, payee, parsed rules)
  guard/index.ts      evaluate() / pay() / resolve(): orchestration and persistence
  vendors.ts          vendor catalog + prices (Chainlens, DataPulse, scam "datapu1se")
  vendor-server.ts    seller side: 402, nonce, replay protection, verify via chain, serve data
  agent.ts            buyer agent: fetch → 402 → ask Allowance → pay → retry with X-PAYMENT
  demo.ts             scripted week + persona answers
  stats.ts            dashboard state + morning brief
src/app/api/          vendors/[vendor]/[endpoint], state, agent/run, approvals/[id], demo, memory, health
src/components/Dashboard.tsx   the whole UI (client component, polls /api/state every 4s)
scripts/check-live.ts          live preflight
test/                          engine, learn/encoding, full simulated week
```

**Decision order** (`engine.ts`): hard limits → user rules from memory → transaction checks (balance, prepare, **dry-run must match exactly**) → payee checks (**look-alike**, **payee changed**, new payee) → behaviour (duplicate, price spike) → learned trust. Any block means block. Otherwise any ask means ask. Otherwise pay.

**Memory model:** facts are append-only. Policy is **derived on every decision from what `recall` returns**, so Walrus is the source of truth and not just a log. The local file only mirrors it for fast UI listing.

---

## 4. Audit: findings to fix (in priority order)

Tick these as you fix them. Add a test for each fix where possible.

### P0: must fix before live use or any deploy
- [ ] **A1. API routes have no auth.** Anyone who can reach the server can approve payments (`/api/approvals/[id]`), run the agent and add rules. **Fix:** add `ALLOWANCE_ADMIN_TOKEN`. Require `Authorization: Bearer <token>` on every POST route *except* `/api/vendors/*` (vendors must stay public). The dashboard reads the token once into memory (prompt or env). Until this is fixed, **run only on localhost**, never deploy publicly.
- [ ] **A2. Live demo can pay an address nobody controls.** In live mode:
  - the "Redirected invoice" scenario (`payto=new` → `simAddress(...)`)
  - the scam vendor `datapu1se` (look-alike address)

  Both are only *blocked* once the real vendor is already in memory. If you run them first, they come up as `NEW_PAYEE` → **ask**, and approving them would send real USDC to an unowned address. **Fix:** in `vendors.ts`, mark both as `demoAttack: true`. In `engine.ts` (or `evaluate`), always **block** in live mode when the payee is a demo-attack address, with a clear message. Add a test. Also disable those "Try it" buttons until the real vendor is known.
- [ ] **A3. Balance polling burns Tatum credits.** `/api/state` calls `getBalance` every 4 s per open tab. **Fix:** cache the balance for 30 s in `stats.ts`, and slow polling to 10 s in live mode.

### P1: correctness and hardening
- [ ] **A4. Transaction build through Tatum JSON-RPC is untested.** `tx.build({ client })` uses `SuiJsonRpcClient`, which is deprecated in `@mysten/sui` 2.x, for coin selection and gas. Tatum may not expose every method it needs. **Test live first** (§5.3, L3). If it fails, try in order:
  - (a) set an explicit gas budget with `tx.setGasBudget(…)` and `tx.setGasPrice(await rpc.call("suix_getReferenceGasPrice"))`
  - (b) select USDC coins yourself with `suix_getCoins` + `tx.splitCoins`
  - (c) switch the builder to `SuiGrpcClient` (`@mysten/sui/grpc`) on Tatum's gRPC endpoint `https://sui-mainnet-grpc.gateway.tatum.io`

  Keep all reads on Tatum, because the hackathon scores "Tatum Sui RPC" usage.
- [ ] **A5. The `ToAddress` filter in `suix_queryTransactionBlocks`** (payee history) may be unsupported or slow on the gateway. If it errors, fall back to `FromAndToAddress` or treat the payee as new. It's already wrapped in `Promise.allSettled`, but confirm the UI shows a sensible message.
- [ ] **A6. Vendor verification gaps** in `vendor-server.ts`:
  - it doesn't check that `payment.payload.payer` equals the transaction sender
  - it doesn't enforce nonce expiry (10 min)
  - it accepts overpayment silently

  Add all three, plus tests.
- [ ] **A7. Each payment is slow in live mode.** `rememberAndWait` runs for every auto-paid decision. **Fix:** for `by: "allowance"` facts, use `memwal.remember()` (no wait) and fill in the blob id later. Keep `rememberAndWait` for human decisions and rules, since those must be recallable at once.
- [ ] **A8. Walrus recall relevance.** `recallFor` runs 3 semantic queries with `limit 30`. Check live that rules and payee facts actually come back for unrelated wording. If recall misses facts, the policy is wrong. Consider `sort: "recent"` for the rules query, or a `maxDistance` threshold. Log what was recalled in the decision (already shown in the UI as "Memories it recalled").
- [ ] **A9. Concurrency.** The JSON file store is single-process and not transaction-safe. That's fine for localhost and the demo. If you deploy, use one instance with a persistent disk (Railway or Fly volume), **not** Vercel serverless.
- [ ] **A10. Day accounting.** With `demoDay > 0`, "spent today" counts demo days, not calendar days. That's fine for the demo, but document it. Real usage should reset `demoDay` to 0.

### P2: nice to have
- [ ] A11. Use typed responses in `tatum.ts` instead of `any` (clears the lint warnings).
- [ ] A12. Add `/api/health` checks to the dashboard header: Tatum ✓, Walrus ✓, wallet funded ✓.
- [ ] A13. Add a "Rebuild from Walrus" button: delete the local mirror and repopulate it from `listMemories()`, which shows that memory really is portable.
- [ ] A14. Error states in the UI for a failed payment, with a retry button.

---

## 5. Test plan

### 5.1 Automated (run before every commit)
```bash
npm test && npm run typecheck && npm run lint && npm run build
```
What's covered today:
- `test/engine.test.ts`: every check, learned trust, rule limits, denial semantics, hard caps
- `test/learn.test.ts`: note → rule parsing, fact encoding, the X-PAYMENT header
- `test/week.test.ts`: a full simulated week end to end. Asks per day go **3 1 0 1 1 0 0**. It also covers the duplicate, look-alike and payee-changed blocks, vendor verification on every payment, 10+ memories, replay protection and the morning brief.

**Add tests for:** A1 (401 without a token), A2 (live demo-attack always blocks), A6 (wrong payer, expired nonce).

### 5.2 Manual: sim mode (no keys needed)
Run `ALLOWANCE_MODE=sim`, then `npm run dev`. Click **Reset sim data** first.

| # | Do | Expect |
|---|---|---|
| S1 | Try it → "Routine: Chainlens wallet report" | Inbox shows 1 item: `NEW_PAYEE`, `NOT_LEARNED`, `DRYRUN_MATCH` |
| S2 | Approve with the note "auto-approve under 5 cents from them" | Activity: paid, data shown. Memory: decision + payee + **rule** |
| S3 | Try it → Chainlens wallet report again | **Auto-paid**, citing the rule memory |
| S4 | Try it → "Redirected invoice (Chainlens)" | **Blocked** `PAYEE_CHANGED` |
| S5 | Try it → DataPulse market brief, approve; repeat, approve | The third one auto-pays (learned after 2) |
| S6 | Try it → "Scam: look-alike DataPulse" | **Blocked** `LOOKALIKE_PAYEE` |
| S7 | Try it → "Price spike (×6)" | Asks `PRICE_SPIKE`. Deny with "ask me above 5 cents for them" |
| S8 | Memory tab → type "keep it under $2 a day" | A daily_budget rule appears |
| S9 | Reset → **Simulate a week** | The chart falls 3 → 0. The brief lists the rules |

### 5.3 Live mode (mainnet, real money: small amounts)
Do these in order. Stop and fix if any fails.

| # | Do | Expect / verify |
|---|---|---|
| L1 | `npm run check:live` | All ✅: gas price, wallet SUI ≥ 0.05, USDC ≥ $0.50, Walrus health, write → blob id, recall ≥ 1 |
| L2 | `curl localhost:3000/api/health` | `{ ok: true, tatum: "<gas price>", walrus: {...} }` |
| L3 | `curl -i "localhost:3000/api/vendors/chainlens/wallet-report?address=<any 0x addr>"` | `402` with `network: "sui:mainnet"`, your vendor `payTo`, and the USDC coin type |
| L4 | Try it → "Routine: Chainlens wallet report". Approve in the Inbox | The payment executes. In Activity, the tx link opens on **suiscan.xyz/mainnet** and shows −$0.01 USDC from the agent and +$0.01 to the vendor. The **"✓ verified by vendor"** badge shows, and real balances appear in the result |
| L5 | Memory tab | New entries show `walrus:<blob>` ids. Check the **memory.walrus.xyz dashboard**: they're there |
| L6 | Approve one more Chainlens request with the note "auto-approve under 5 cents from them", then send another | The last one is **auto-paid** with no ask |
| L7 | **Portability test (great for the blog):** stop the server, delete `.data/allowance-live.json`, start again, send a Chainlens request | Still **auto-paid**, because the rule was recalled from **Walrus**, not from the local file |
| L8 | (After A2 is fixed) Try it → scam and redirected invoice | Both **blocked**. No USDC moves |
| L9 | Click **Run agent: day N** a few times, or **Simulate a week** | 10+ memories on Walrus mainnet (**hard requirement**), about 30 small payments |
| L10 | Check the totals | `Memories ≥ 10 · on Walrus ≥ 10`. Screenshot the dashboard, the Walrus dashboard and one suiscan tx for the blog |

### 5.4 Things to watch in the live logs
- Tatum `429` means you're rate-limited. Slow the polling (A3) and add a retry with backoff in `TatumSuiRpc.call`.
- Walrus `MemWalRateLimitedError` or a timeout means you should space out writes (A7).
- `dry-run no longer matches` at pay time is expected if balances changed between the ask and the approval. Just retry.

---

## 6. Submission steps (from CHECKLIST.md)
1. **Repo:** push to a public GitHub repo. Check `.env.local` is **not** committed (`git ls-files | grep env` should show only `.env.example`).
2. **Blog post** (required): what it does, how it uses Tatum (the RPC call table in README) and Walrus, and **how it learned over time**. Include the chart, the L7 portability test and the organiser's quote on 402 settlement.
3. **Demo video** (2–3 min), in this order:
   1. Day-1 asks
   2. An approval with a rule note
   3. Auto-pay
   4. The scam blocked
   5. "Simulate a week" and the chart
   6. A suiscan tx
   7. The Walrus memories
4. **X post** tagging @Tatum_io and @WalrusFoundation.
5. **Form:** Tatum **account ID**, **`MEMWAL_AGENT_ID`** (delegate public key), repo URL, demo or video URL, blog URL.
6. Submit before **Tue 10 Nov, 17:00 UTC**.

---

## 7. Ground rules for Claude Code in this repo
- Develop in **sim mode**. Only switch to live for §5.3.
- **Never print, log or echo** env values, private keys or `.env.local` contents. Don't add them to test fixtures.
- Keep `decide()` **pure**. All I/O lives in `guard/index.ts` and the adapters.
- Memory can **never raise hard limits** (`HARD_*`). Keep that invariant and its test.
- Every new check needs an engine test, and a week-test assertion if it affects the demo.
- Run `npm test && npm run typecheck && npm run build` before each commit.
- Update **CHECKLIST.md** ticks as items are done.
