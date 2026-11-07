# Allowance — demo video script (2–3 min)

Goal: show that the agent **pays the routine itself, blocks the sketchy, and learns your rules on
Walrus** — settled in real USDC on Sui via Tatum. Record at 1440×900, dark room, cursor visible.

**Setup before recording**
- Have two terminals ready. Sim mode for the fast story, one live mainnet payment for proof.
- Sim: `ALLOWANCE_MODE=sim npm run dev` → open http://localhost:3000 → click **Reset sim data**.
- Have a Suiscan tab open to a real tx (e.g. `9yeQWKKRtu6pGkrDwKpK6F1uR6GzZppm1fJY5nQQPuTW`).

---

### 0:00 — Hook (10s)
> "Agents can pay for things now. That's the scary part — one bad prompt and you get a surprise bill.
> Allowance gives your agent a spending allowance it can't blow."

Show the Overview with the balance in gold and "Handled without you".

### 0:10 — Day one, it asks about everything (25s)
- Overview → **Run agent: day 1**. Open **Inbox**.
> "Day one, it doesn't know your rules, so it asks — and it shows its work: the checks it ran and the
> memories it recalled."
- Point at a pending item's **Checks** and **Memories it recalled** (empty — nothing learned yet).

### 0:35 — Approve with a rule, in plain words (25s)
- Approve one with the note **"auto-approve under 5 cents from them."**
> "I approve it and teach it a rule in plain English. That becomes memory on Walrus — the decision,
> the payee, and the rule."
- Open **Memory** → show the new `walrus:<blob>` entries.

### 1:00 — Now it pays on its own (15s)
- **Try it → Routine: Chainlens wallet report** again → it **auto-pays**.
> "Same vendor, same shape — now it just pays, and cites the rule it remembered."

### 1:15 — It blocks the sketchy (25s)
- **Try it → Scam: look-alike DataPulse** → **blocked**.
- **Try it → Redirected invoice** → **blocked**.
> "A look-alike vendor, or a known vendor suddenly asking for a new address — blocked. It dry-runs
> every transaction and refuses anything that isn't exactly right. Multisig security, for agents."

### 1:40 — The whole week, learning on a chart (20s)
- **Reset** → **Simulate a week**.
> "Over a week the asks fall as the memories grow — green is paid-on-its-own, gold is asked-you."
- Show the chart dropping 3 → 0 and the morning brief listing the rules.

### 2:00 — It's real money on Sui (25s)
- Cut to the **live** dashboard (LIVE · Sui mainnet, real balance).
- Open **Activity** → expand a paid row → click the **suiscan** link → the real tx: −$0.01 USDC,
  sender → vendor, "✓ verified by vendor".
> "This is mainnet. Real USDC on Sui, every payment verified on-chain through Tatum. 12 for 12 in
> testing."

### 2:25 — Portability close (15s)
- Memory tab, 10+ `walrus:` memories.
> "And because the rules live on Walrus, not on disk — I deleted the whole local database, restarted,
> and it still auto-paid from memory. The agent's judgment is portable. That's Allowance."

### End card
Repo + "Built with Tatum + Walrus · Total Recall".
