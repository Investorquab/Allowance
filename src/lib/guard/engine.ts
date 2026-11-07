import { fmtUsd } from "../config";
import type { CheckResult, Decision, PayeeHistory, PaymentRequest, PreparedPayment, StoredFact, Units } from "../types";
import type { DerivedPolicy } from "./policy";

export interface EngineInput {
  request: PaymentRequest;
  policy: DerivedPolicy;
  /** "live" makes demo-attack requests an unconditional block (A2). Defaults to non-live. */
  mode?: "sim" | "live";
  agentAddress: string;
  expectedNetwork: string;
  expectedAsset: string;
  balance?: Units;
  prepared?: PreparedPayment;
  prepareError?: string;
  payeeHistory?: PayeeHistory;
  spentToday: Units;
  recentFingerprints: { fingerprint: string; at: string }[];
  now: Date;
  limits: { hardPerPayment: Units; hardDaily: Units; duplicateWindowMin: number; priceSpikeFactor: number };
}

const big = BigInt;

/** Same first 6 and last 4 hex chars, different address = classic poisoning look-alike. */
export function isLookalike(a: string, b: string) {
  const x = a.toLowerCase().replace(/^0x/, "");
  const y = b.toLowerCase().replace(/^0x/, "");
  return x !== y && x.slice(0, 6) === y.slice(0, 6) && x.slice(-4) === y.slice(-4);
}

/**
 * Pure decision function. Order: hard limits → user rules → transaction checks → learned trust.
 * Any "block" blocks. Otherwise any "ask" asks. Otherwise pay.
 */
export function decide(input: EngineInput): Decision {
  const { request: r, policy: p, limits } = input;
  const req = r.requirement;
  const amt = big(req.amount);
  const checks: CheckResult[] = [];
  const used = new Map<string, StoredFact>();
  const add = (level: CheckResult["level"], code: string, message: string, facts: StoredFact[] = []) => {
    checks.push({ level, code, message });
    for (const f of facts) used.set(f.id, f);
  };

  // ── 0. Demo-attack guard (A2): in live mode, never send real USDC to a built-in
  //    look-alike vendor or a redirected invoice, even before the real vendor is known. ──
  if (input.mode === "live" && req.demoAttack)
    add("block", "DEMO_ATTACK", `${req.vendorName} here is a built-in demo attack (look-alike address or redirected invoice). Allowance will not send real USDC to an address nobody controls.`);

  // ── 1. Hard limits (set by a human in config; memory can never raise these) ──
  if (amt > big(limits.hardPerPayment)) add("block", "HARD_PER_PAYMENT", `${fmtUsd(amt)} is over the hard per-payment cap of ${fmtUsd(limits.hardPerPayment)}.`);
  if (big(input.spentToday) + amt > big(limits.hardDaily)) add("block", "HARD_DAILY", `Would take today's spend to ${fmtUsd(big(input.spentToday) + amt)}, over the hard daily cap of ${fmtUsd(limits.hardDaily)}.`);
  if (req.network !== input.expectedNetwork) add("block", "WRONG_NETWORK", `Vendor asked for payment on ${req.network}; Allowance only pays on ${input.expectedNetwork}.`);
  if (req.asset !== input.expectedAsset) add("block", "WRONG_ASSET", `Vendor asked for ${req.asset}; Allowance only pays in USDC.`);
  if (new Date(req.expiresAt) < input.now) add("block", "EXPIRED", "The vendor's payment request has expired.");

  // ── 2. Rules the user told us (from memory) ──
  if (p.never) add("block", "NEVER_PAY", `You told me never to pay ${req.vendor}.`, [p.never]);
  if (p.dailyBudget && big(input.spentToday) + amt > big(p.dailyBudget.amount))
    add("ask", "OVER_BUDGET", `Over your daily budget of ${fmtUsd(p.dailyBudget.amount)} (spent ${fmtUsd(input.spentToday)} today).`, [p.dailyBudget.fact]);
  if (p.askAbove && amt > big(p.askAbove.amount))
    add("ask", "ASK_ABOVE", `You asked to be checked on anything over ${fmtUsd(p.askAbove.amount)}${req.vendor ? ` from ${req.vendorName}` : ""}.`, [p.askAbove.fact]);

  // ── 3. Transaction checks (Tatum Sui RPC) ──
  if (input.balance !== undefined && big(input.balance) < amt) add("block", "LOW_BALANCE", `Agent wallet holds ${fmtUsd(input.balance)}; this needs ${fmtUsd(amt)}. Top up first.`);
  if (input.prepareError) add("block", "PREPARE_FAILED", `Could not build the payment: ${input.prepareError}`);
  if (input.prepared) {
    const d = input.prepared.dryRun;
    if (!d.ok) add("block", "DRYRUN_FAILED", `Dry-run failed: ${d.error ?? "unknown error"}.`);
    else {
      // The dry-run must do exactly what the vendor asked: −amount from us, +amount to payTo, nothing else in that coin.
      const inCoin = d.changes.filter((c) => c.coinType === req.asset);
      const ours = inCoin.find((c) => c.owner.toLowerCase() === input.agentAddress.toLowerCase());
      const theirs = inCoin.find((c) => c.owner.toLowerCase() === req.payTo.toLowerCase());
      const others = inCoin.filter((c) => c !== ours && c !== theirs);
      const otherCoinsOut = d.changes.filter((c) => c.coinType !== req.asset && !/::sui::SUI$/.test(c.coinType) && big(c.amount) < 0n);
      if (!ours || big(ours.amount) !== -amt || !theirs || big(theirs.amount) !== amt || others.length || otherCoinsOut.length)
        add("block", "DRYRUN_MISMATCH", `The simulated transaction does not match the request (expected exactly ${fmtUsd(amt)} from you to ${req.payTo.slice(0, 10)}…).`);
      else add("ok", "DRYRUN_MATCH", `Dry-run matches exactly: ${fmtUsd(amt)} from your agent to the vendor, gas only otherwise.`);
    }
  }

  // ── 4. Payee checks (memory + chain history) ──
  const lookalike = p.knownPayees.find((k) => isLookalike(k.payTo, req.payTo));
  if (lookalike) {
    const who = lookalike.fact.fact.kind === "payee" ? lookalike.fact.fact.label : lookalike.vendor;
    add("block", "LOOKALIKE_PAYEE", `Pay-to address looks like ${who}'s known address (same start and end) but is different — a classic poisoning trick.`, [lookalike.fact]);
  }
  if (p.vendorPayees.length && !p.vendorPayees.includes(req.payTo.toLowerCase()))
    add("block", "PAYEE_CHANGED", `${req.vendorName} always got paid at ${p.vendorPayees[0].slice(0, 10)}…; this request wants a different address.`, p.knownPayees.filter((k) => k.vendor === req.vendor).map((k) => k.fact));
  if (!p.vendorPayees.length && (input.payeeHistory?.incomingTxCount ?? 0) < 3)
    add("ask", "NEW_PAYEE", `First time paying ${req.vendorName}, and its address has almost no onchain history.`);

  // ── 5. Behaviour checks ──
  const windowStart = input.now.getTime() - limits.duplicateWindowMin * 60_000;
  const dup = input.recentFingerprints.find((f) => f.fingerprint === r.fingerprint && new Date(f.at).getTime() >= windowStart);
  if (dup) add("block", "DUPLICATE", `Already bought this exact ${req.endpoint} in the last ${limits.duplicateWindowMin} min — the agent should reuse it.`);
  if (p.priceNorm && amt > big(p.priceNorm) * big(Math.round(limits.priceSpikeFactor * 100)) / 100n)
    add("ask", "PRICE_SPIKE", `${fmtUsd(amt)} is more than ${limits.priceSpikeFactor}× the usual ${fmtUsd(p.priceNorm)} for ${req.vendorName} ${req.endpoint}.`, p.paid.slice(-3));

  // ── 6. Learned trust ──
  const limit = [p.ruleLimit?.amount, p.learnedLimit].filter(Boolean).map((x) => big(x!)).reduce((a, b) => (b > a ? b : a), 0n);
  if (limit > 0n && amt <= limit) {
    const why = p.ruleLimit && amt <= big(p.ruleLimit.amount) ? [p.ruleLimit.fact] : p.learnedFrom;
    add("ok", "LEARNED_OK", p.ruleLimit && amt <= big(p.ruleLimit.amount)
      ? `Within your rule: auto-approve under ${fmtUsd(p.ruleLimit.amount)}.`
      : `You approved ${req.vendorName} ${req.endpoint} ${p.approvals.length}× before at up to ${fmtUsd(p.learnedLimit!)}.`, why);
  } else if (p.denials.length && !p.approvals.length) {
    add("ask", "PREVIOUSLY_DENIED", `You denied ${req.vendorName} ${req.endpoint} before.`, p.denials.slice(-2));
  } else {
    add("ask", "NOT_LEARNED", limit > 0n
      ? `${fmtUsd(amt)} is above what you've let me auto-pay here (${fmtUsd(limit)}).`
      : p.approvals.length
        ? `You've approved ${req.vendorName} ${req.endpoint} ${p.approvals.length}× so far — one or two more and I'll stop asking (or tell me a rule).`
        : `I haven't learned your preference for ${req.vendorName} ${req.endpoint} yet.`, p.approvals.slice(-2));
  }

  const action = checks.some((c) => c.level === "block") ? "block" : checks.some((c) => c.level === "ask") ? "ask" : "pay";
  const rank = { block: 0, ask: 1, ok: 2, info: 3 } as const;
  checks.sort((a, b) => rank[a.level] - rank[b.level]);
  const lead = checks.find((c) => c.level === (action === "pay" ? "ok" : action));
  const summary =
    action === "pay" ? `Auto-paid ${fmtUsd(amt)} to ${req.vendorName} — ${lead?.message ?? ""}`
    : action === "ask" ? `Asking you about ${fmtUsd(amt)} to ${req.vendorName}: ${lead?.message ?? ""}`
    : `Blocked ${fmtUsd(amt)} to ${req.vendorName}: ${lead?.message ?? ""}`;

  return {
    requestId: r.id,
    action,
    summary,
    checks,
    memoriesUsed: [...used.values()].map((f) => ({ id: f.id, text: f.text, blobId: f.blobId })),
    learnedLimit: limit > 0n ? limit.toString() : undefined,
    decidedAt: input.now.toISOString(),
  };
}
