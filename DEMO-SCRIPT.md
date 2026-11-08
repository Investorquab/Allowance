# Allowance — demo video script (~2:30)

Goal: show that the agent **pays the routine itself, blocks the sketchy, learns your rules on Walrus,
and settles real USDC on Sui via Tatum**. Record at 1440×900, dark room, cursor visible.

**Setup before recording**
- Two terminals ready: a **sim** session for the fast story, a **live** mainnet session for proof.
- Sim: `ALLOWANCE_MODE=sim npm run dev` → http://localhost:3000 → click **Reset sim data**.
- Have a Suiscan tab open to a real tx (e.g. `9yeQWKKRtu6pGkrDwKpK6F1uR6GzZppm1fJY5nQQPuTW`).
- Put a small on-screen caption **"Sim mode · same guard logic"** on every sim beat, so the cut to live is unambiguous.

**🔒 Recording safety:** before you hit record in live mode, close `.env.local`, hide wallet/Tatum keys,
and clear terminal scrollback. If a key ever appears in a take, stop, rotate it, and re-record. Never
show `AGENT_SUI_PRIVATE_KEY`, `TATUM_API_KEY` or `MEMWAL_PRIVATE_KEY`.

---

### 0:00 — Hook (12s)
> "Agents can pay for things now — one bad prompt and you get a surprise bill. Allowance gives your
> agent a spending allowance it can't blow — real money, on-chain."

Show the Overview (balance in gold, "Handled without you"). **Flash the `LIVE · Sui mainnet` badge / a
Suiscan tx for ~1s** so "real money" is planted early — you'll pay it off at the end.

### 0:12 — Day one, it asks about everything (23s)
- Overview → **Run agent: day 1**. Open **Inbox**.
> "Day one it doesn't know your rules, so it asks — and shows its work: the checks it ran and the
> memories it recalled."
- Point at a pending item's **Checks** and **Memories it recalled** (empty — nothing learned yet).

### 0:35 — Approve with a rule, in plain words (23s)
- Approve one with a loose note: **"fine — keep it under two bucks a day from them."**
> "I approve it and teach a rule in plain English — note I said 'two bucks', not a number. Walrus
> `analyze()` turns that into a real rule and stores my words as memory I own."
- Open **Memory** → show the new `walrus:<blob>` entries, including the parsed daily-budget rule.

### 0:58 — Now it pays on its own (14s)
- **Try it → Routine: Chainlens wallet report** again → it **auto-pays**.
> "Same vendor, same shape — now it just pays, and cites the rule it remembered."

### 1:12 — It guards a *real* external API (14s)
- **Try it → Real API: SUI spot price (PriceWire)** → it **auto-pays** → expand the row to show the
  live result (`source: CoinGecko API (live…)`).
> "This isn't a toy vendor — PriceWire fronts a real third-party API. A cent in USDC on Sui unlocks
> live market data. Allowance is the paywall in front of any real API your agent uses."

### 1:26 — It blocks the sketchy (20s)
- **Try it → Scam: look-alike DataPulse** → **blocked**. **Try it → Redirected invoice** → **blocked**.
> "A look-alike vendor, or a known vendor suddenly asking for a new address — blocked. It dry-runs every
> transaction and refuses anything that doesn't match exactly."

### 1:46 — The whole week, learning on a chart (16s)
- **Reset** → **Simulate a week**.
> "Over a week the asks fall as the memories grow — green is paid-on-its-own, gold is asked-you."
- Show the chart dropping 3 → 0 and the morning brief listing the rules.

### 2:02 — It's real money on Sui (20s)
- Cut to the **live** dashboard (`LIVE · Sui mainnet`, real balance — drop the sim caption here).
- **Activity** → expand a paid row → click the **suiscan** link → the real tx: −$0.01 USDC, sender →
  vendor, **"✓ verified by vendor"**.
> "This is mainnet. 12 mainnet payments in testing, all verified on-chain through Tatum."

### 2:22 — Portability close, on camera (8s)
- In the terminal: delete `.data/allowance-live.json`, restart the server, run the same vendor → it
  **still auto-pays**. (Jump-cut; keep it tight.)
> "I deleted the whole local database — and it still auto-paid, because the rule lives on Walrus, not
> on disk. Portable agent judgment. That's Allowance."

### End card
Repo + "Built with Tatum + Walrus · Total Recall".

---

_Total: ~2:30. Beats: 12 + 23 + 23 + 14 + 14 + 20 + 16 + 20 + 8 = 150s._
