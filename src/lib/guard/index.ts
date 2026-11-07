import { invalidateBalanceCache } from "../balance-cache";
import { services } from "../services";
import { db, newId, save, type ActivityItem } from "../store";
import type { Decision, PaymentRequest, PaymentRequirement, PreparedPayment, StoredFact } from "../types";
import { decide } from "./engine";
import { factsFromHumanDecision } from "./learn";
import { derivePolicy } from "./policy";

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
  const queries = [
    `payments to ${req.vendorName} ${req.vendor} for ${req.endpoint}`,
    `spending rules and limits set by the user`,
    `${req.vendorName} ${req.vendor} is paid at address ${req.payTo}`,
  ];
  // Sequential on purpose: the Walrus relayer rate-limits concurrent recalls, and firing these three
  // in parallel made the first auto-pay's tail latency much worse (see FIELD-TEST.md).
  const seen = new Map<string, StoredFact>();
  for (const q of queries) for (const f of await memory.recall(q, 30)) seen.set(f.blobId ?? f.id, f);
  return [...seen.values()];
}

export async function evaluate(input: { agent: string; task: string; requirement: PaymentRequirement; fingerprint: string }) {
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
  await memory.remember({
    kind: "decision", vendor: r.vendor, endpoint: r.endpoint, payTo: r.payTo, amount: r.amount, outcome, by: "allowance",
    note: outcome === "blocked" ? `blocked: ${lead}` : undefined, at: new Date().toISOString(),
  });
}

export async function recordAutoPaid(req: PaymentRequest, decision: Decision) {
  await rememberAllowanceOutcome(req, "auto-paid", decision);
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
