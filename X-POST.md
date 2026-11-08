# X / social post drafts

Tag **@Tatum_io** and **@WalrusFoundation**. Attach the Overview screenshot (or the demo video).

---

## Main post (single tweet)

> Agents can pay for things now — so I built **Allowance**: a spending allowance your AI agent can't blow.
>
> It pays the routine itself, blocks look-alikes & redirected invoices, and learns your rules — stored on @WalrusFoundation Memory. Real USDC on Sui, settled & verified via @Tatum_io.
>
> 12/12 live payments. 🧵

## Thread

**2/** Every payment is dry-run before signing — if the simulated transfer isn't *exactly* what was
asked, it refuses. Multisig security, applied to agent spending. Scam vendor `datapu1se`? Blocked.

**3/** The rules live on @WalrusFoundation, so they're the policy, not a log. I deleted the entire
local DB, restarted, and it still auto-paid — recalled the rule from Walrus. Portable agent judgment.

**4/** Every on-chain read, the dry-run, the execute and the vendor's verification go through
@Tatum_io's Sui gateway. (Sui dropped JSON-RPC mid-build — ported the adapter to Tatum's GraphQL.)

**5/** Not just toy vendors: it guards a **real** external API — PriceWire fronts live CoinGecko/FX
data, and the agent pays a cent in USDC on Sui to unlock it. Allowance is the paywall for any API your
agent uses.

**6/** You don't have to phrase rules like a machine. Say "keep it under two bucks a day" and
@WalrusFoundation `analyze()` turns it into an enforceable rule — while storing your own words as memory
you own.

**7/** The asks-per-day chart falls as it learns. Day 1 it asks about everything; by end of week it
handles ~83% on its own. Live on Sui mainnet. Built for Total Recall 🐳🔗
> Code: https://github.com/Investorquab/Allowance

---

## Reply to the "what are you building?" Walrus Sessions thread

> An AI agent that pays your routine micro-invoices itself and asks before anything odd — and it
> remembers every approve/deny, so you stop re-approving the same $0.01 API bill forever. Rules live in
> @WalrusFoundation Memory; it settles in USDC on Sui via @Tatum_io.

---

## LinkedIn variant (optional)

Same content, one paragraph + the chart image, less thread-y. Lead with the $38k-cache-miss problem,
then "here's an agent that can't do that."
