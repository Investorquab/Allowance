import { invalidateBalanceCache } from "../balance-cache";
import { services } from "../services";
import { db, newId, save, type ActivityItem } from "../store";
import type { Decision, Fact, PaymentRequest, PaymentRequirement, PreparedPayment, StoredFact } from "../types";
import { decide } from "./engine";
import { factsFromHumanDecision, parseRules } from "./learn";
import { derivePolicy } from "./policy";

// A10: with demoDay > 0 the "day" is the demo day, not the calendar date — so "spent today" and the
// daily cap count per demo day during "Simulate a week". Real usage keeps demoDay at 0 (calendar day).
export const dayKey = (d = db()) => (d.demoDay > 0 ? `day-${d.demoDay}` : new Date().toISOString().slice(0, 10));

export function spentToday(): bigint {
  const k = dayKey();
  return db()
    .activity.filter((a) => a.final === "paid" && activityDayKey(a) === k)
    .reduce((s, a) => s + BigInt(a.amount), 0n);
}
const activityDayKey = (a: ActivityItem) => (a.day > 0 ? `day-${a.day}` : a.at.slice(0, 10));

/** Recall everything relevant to this payment from memory (Walrus in live mode). */
export async function recallFor(req: PaymentRequirement): Promise<StoredFact[]> {
  const { memory } = services();
  // Sequential on purpose: the Walrus relayer rate-limits concurrent recalls, and firing these in
  // parallel made the first auto-pay's tail latency much worse (see FIELD-TEST.md).
  const seen = new Map<string, StoredFact>();
  const add = (facts: StoredFact[]) => { for (const f of facts) seen.set(f.blobId ?? f.id, f); };
  add(await memory.recall(`payments to ${req.vendorName} ${req.vendor} for ${req.endpoint}`, 30));
  // A8: recall rules newest-first, so a rule the user changed later wins over an older one.
  add(await memory.recall(`spending rules and limits set by the user`, 30, { sort: "recent" }));
  add(await memory.recall(`${req.vendorName} ${req.vendor} is paid at address ${req.payTo}`, 30));
  return [...seen.values()];
}

/**
 * The "memory switch": decide the same payment twice — once with everything recalled from Walrus,
 * once with no memory at all — to show, side by side, that memory is what changes the outcome.
 * Read-only: it recalls and decides, but never prepares a tx, pays, or writes anything.
 */
export async function compareMemory(requirement: PaymentRequirement, task: string) {
  const { chain, config } = services();
  const req: PaymentRequest = {
    id: newId("req"), createdAt: new Date().toISOString(), agent: "preview", task, requirement, fingerprint: "preview",
  };
  const facts = await recallFor(requirement);
  const key = { vendor: requirement.vendor, endpoint: requirement.endpoint };
  const common = {
    request: req,
    mode: config.mode,
    agentAddress: chain.agentAddress(),
    expectedNetwork: config.network,
    expectedAsset: config.usdcCoinType,
    spentToday: spentToday().toString(),
    recentFingerprints: [],
    now: new Date(),
    limits: {
      hardPerPayment: config.hardPerPayment,
      hardDaily: config.hardDaily,
      duplicateWindowMin: config.duplicateWindowMin,
      priceSpikeFactor: config.priceSpikeFactor,
    },
  };
  return {
    requirement,
    memoriesRecalled: facts.length,
    withMemory: decide({ ...common, policy: derivePolicy(facts, key, config.learnAfterApprovals) }),
    withoutMemory: decide({ ...common, policy: derivePolicy([], key, config.learnAfterApprovals) }),
  };
}

export async function evaluate(input: { agent: string; task: string; requirement: PaymentRequirement; fingerprint: string; jobId?: string; jobLabel?: string }) {
  const { chain, config } = services();
  const req: PaymentRequest = { id: newId("req"), createdAt: new Date().toISOString(), ...input };
  const facts = await recallFor(req.requirement);
  const policy = derivePolicy(facts, { vendor: req.requirement.vendor, endpoint: req.requirement.endpoint }, config.learnAfterApprovals);

  const agentAddress = chain.agentAddress();
  let balance: string | undefined, prepared: PreparedPayment | undefined, prepareError: string | undefined;
  const [bal, hist] = await Promise.allSettled([
    chain.getBalance(agentAddress, req.requirement.asset),
    chain.payeeHistory(req.requirement.payTo),
  ]);
  if (bal.status === "fulfilled") balance = bal.value;
  if (!balance || BigInt(balance) >= BigInt(req.requirement.amount)) {
    try {
      prepared = await chain.preparePayment(req.requirement.payTo, req.requirement.asset, req.requirement.amount);
    } catch (e) {
      prepareError = e instanceof Error ? e.message : String(e);
    }
  }

  const d = db();
  const decision = decide({
    request: req,
    policy,
    mode: config.mode,
    agentAddress,
    expectedNetwork: config.network,
    expectedAsset: config.usdcCoinType,
    balance,
    prepared,
    prepareError,
    payeeHistory: hist.status === "fulfilled" ? hist.value : undefined,
    spentToday: spentToday().toString(),
    recentFingerprints: d.activity
      .filter((a) => a.final === "paid")
      .map((a) => ({ fingerprint: d.requests[a.requestId]?.fingerprint, at: a.at })),
    now: new Date(),
    limits: {
      hardPerPayment: config.hardPerPayment,
      hardDaily: config.hardDaily,
      duplicateWindowMin: config.duplicateWindowMin,
      priceSpikeFactor: config.priceSpikeFactor,
    },
  });

  d.requests[req.id] = req;
  d.decisions[req.id] = decision;
  d.activity.push({
    requestId: req.id,
    at: req.createdAt,
    day: d.demoDay,
    jobId: req.jobId,
    jobLabel: req.jobLabel,
    task: req.task,
    vendor: req.requirement.vendorName,
    endpoint: req.requirement.endpoint,
    amount: req.requirement.amount,
    payTo: req.requirement.payTo,
    action: decision.action,
    final: decision.action === "ask" ? "pending" : decision.action === "block" ? "blocked" : "pending",
    summary: decision.summary,
  });
  if (decision.action === "ask") d.pending.push({ requestId: req.id, createdAt: req.createdAt });
  save();

  if (decision.action === "block") await rememberAllowanceOutcome(req, "blocked", decision);
  return { request: req, decision, prepared };
}

/**
 * Sign + send. Re-prepares and re-checks the dry-run right before signing, because a human approval
 * can be minutes old. For an **immediate auto-pay**, `fresh` is the payment `evaluate` just built
 * (milliseconds ago) and is reused — this halves the Tatum calls per payment (see FIELD-TEST.md).
 * Either way the dry-run must still match the request exactly before anything is signed.
 */
export async function pay(requestId: string, fresh?: PreparedPayment): Promise<{ digest: string; explorerUrl: string | null }> {
  const { chain } = services();
  const d = db();
  const req = d.requests[requestId];
  const act = d.activity.find((a) => a.requestId === requestId);
  if (!req || !act) throw new Error("unknown request");
  if (act.final === "paid") return { digest: act.digest!, explorerUrl: chain.explorerTxUrl(act.digest!) };
  const r = req.requirement;
  // Don't spend on an offer the vendor will no longer honour: the 402 nonce expires (A6), so an
  // approval that arrives after expiry would pay but get no data. Refuse before touching the chain.
  if (new Date(r.expiresAt).getTime() < Date.now())
    throw new Error("This payment offer expired before it was approved — ask the vendor for a fresh quote and try again.");
  try {
    const prepared = fresh ?? (await chain.preparePayment(r.payTo, r.asset, r.amount));
    const ours = prepared.dryRun.changes.find((c) => c.coinType === r.asset && c.owner.toLowerCase() === prepared.from.toLowerCase());
    if (!prepared.dryRun.ok || !ours || BigInt(ours.amount) !== -BigInt(r.amount)) throw new Error("dry-run no longer matches the request");
    const digest = await chain.executePayment(prepared);
    invalidateBalanceCache(); // balance just dropped; don't serve a stale cached value
    act.final = "paid";
    act.digest = digest;
    d.payments.push({ requestId, digest, amount: r.amount, to: r.payTo, at: new Date().toISOString(), explorerUrl: chain.explorerTxUrl(digest) });
    save();
    return { digest, explorerUrl: chain.explorerTxUrl(digest) };
  } catch (e) {
    act.final = "failed";
    act.summary = `Payment failed: ${e instanceof Error ? e.message : e}`;
    save();
    throw e;
  }
}

async function rememberAllowanceOutcome(req: PaymentRequest, outcome: "auto-paid" | "blocked", decision: Decision) {
  const { memory } = services();
  const r = req.requirement;
  const lead = decision.checks.find((c) => c.level === "block")?.code;
  // A7: allowance's own log entries are low-stakes — write without waiting so the payment isn't held
  // up by the Walrus round-trip. Rules/payees/human decisions still use the default waiting write.
  await memory.remember({
    kind: "decision", vendor: r.vendor, endpoint: r.endpoint, payTo: r.payTo, amount: r.amount, outcome, by: "allowance",
    note: outcome === "blocked" ? `blocked: ${lead}` : undefined, at: new Date().toISOString(),
  }, { wait: false });
}

export async function recordAutoPaid(req: PaymentRequest, decision: Decision) {
  await rememberAllowanceOutcome(req, "auto-paid", decision);
}

/**
 * Rules the deterministic `parseRules` missed in the raw note, recovered via memory `analyze()`
 * (Walrus extractor live; offline normalizer in sim). Returns only rule facts not already captured,
 * so the human's exact words are still stored verbatim by `factsFromHumanDecision`.
 */
async function extraRulesFromAnalyze(note: string, vendor: string, already: Fact[]): Promise<Fact[]> {
  const { memory } = services();
  const have = new Set(
    already.flatMap((f) => (f.kind === "rule" ? [JSON.stringify(f.rule)] : [])),
  );
  const at = new Date().toISOString();
  const out: Fact[] = [];
  let texts: string[] = [];
  try {
    texts = await memory.analyze(note);
  } catch {
    return out; // analyze is best-effort; the deterministic rules already stand
  }
  for (const t of texts) {
    for (const rule of parseRules(t, vendor)) {
      const k = JSON.stringify(rule);
      if (have.has(k)) continue;
      have.add(k);
      out.push({ kind: "rule", rule, source: note, at });
    }
  }
  return out;
}

/** Human answers an ask → learn (write memories) → pay if approved. */
export async function resolve(requestId: string, outcome: "approved" | "denied", note?: string) {
  const { memory } = services();
  const d = db();
  const p = d.pending.find((x) => x.requestId === requestId && !x.resolved);
  const req = d.requests[requestId];
  if (!p || !req) throw new Error("No open approval for that request");
  p.resolved = { outcome, note, at: new Date().toISOString() };
  const known = memory.all().some((f) => f.fact.kind === "payee" && f.fact.vendor === req.requirement.vendor && f.fact.payTo === req.requirement.payTo);
  const facts = factsFromHumanDecision(req, outcome, note, known);
  if (note) facts.push(...(await extraRulesFromAnalyze(note, req.requirement.vendor, facts)));
  const written: StoredFact[] = [];
  for (const f of facts) written.push(await memory.remember(f));
  const act = d.activity.find((a) => a.requestId === requestId)!;
  if (outcome === "denied") {
    act.final = "denied";
    act.summary = `You denied ${act.vendor} ${act.endpoint}${note ? ` — "${note}"` : ""}`;
    save();
    return { learned: written };
  }
  save();
  const paid = await pay(requestId);
  return { learned: written, ...paid };
}
