import { fmtUsd } from "./config";
import { dayKey, spentToday } from "./guard";
import { services } from "./services";
import { db } from "./store";

/** Everything the dashboard needs in one call. */
export async function dashboardState() {
  const { chain, memory, config } = services();
  const d = db();
  let balance: string | null = null;
  let balanceError: string | null = null;
  try {
    balance = await chain.getBalance(chain.agentAddress(), config.usdcCoinType);
  } catch (e) {
    balanceError = e instanceof Error ? e.message : String(e);
  }

  // Learning curve: per day, how often Allowance had to ask vs handled it itself.
  const byDay = new Map<string, { day: string; asked: number; auto: number; blocked: number; spent: bigint }>();
  for (const a of d.activity) {
    const k = a.day > 0 ? `Day ${a.day}` : a.at.slice(5, 10);
    const row = byDay.get(k) ?? { day: k, asked: 0, auto: 0, blocked: 0, spent: 0n };
    if (a.action === "ask") row.asked++;
    else if (a.action === "pay") row.auto++;
    else row.blocked++;
    if (a.final === "paid") row.spent += BigInt(a.amount);
    byDay.set(k, row);
  }
  const series = [...byDay.values()].map((r) => ({ ...r, spent: r.spent.toString() }));

  const total = d.activity.length;
  const auto = d.activity.filter((a) => a.action === "pay").length;
  const facts = memory.all();

  return {
    mode: config.mode,
    chain: chain.name,
    memory: memory.name,
    memoryError: (memory as any).lastError ?? null,
    agentAddress: chain.agentAddress(),
    balance,
    balanceFmt: balance ? fmtUsd(balance) : null,
    balanceError,
    demoDay: d.demoDay,
    today: dayKey(),
    spentToday: spentToday().toString(),
    limits: { hardPerPayment: config.hardPerPayment, hardDaily: config.hardDaily, learnAfterApprovals: config.learnAfterApprovals },
    totals: {
      requests: total,
      autoRate: total ? Math.round((auto / total) * 100) : 0,
      paid: d.activity.filter((a) => a.final === "paid").length,
      blocked: d.activity.filter((a) => a.action === "block").length,
      spent: d.payments.reduce((s, p) => s + BigInt(p.amount), 0n).toString(),
      memories: facts.length,
      onWalrus: facts.filter((f) => f.blobId).length,
    },
    series,
    pending: d.pending
      .filter((p) => !p.resolved)
      .map((p) => ({ ...p, request: d.requests[p.requestId], decision: d.decisions[p.requestId] })),
    activity: [...d.activity].reverse().slice(0, 200).map((a) => ({
      ...a,
      checks: d.decisions[a.requestId]?.checks ?? [],
      memoriesUsed: d.decisions[a.requestId]?.memoriesUsed ?? [],
      explorerUrl: a.digest ? chain.explorerTxUrl(a.digest) : null,
      verified: d.payments.find((p) => p.requestId === a.requestId)?.verifiedByVendor ?? false,
    })),
    facts: [...facts].reverse(),
    tatumCalls: (chain as any).rpc?.calls?.length ?? null,
  };
}

/** "While you slept" summary of the latest day. */
export function morningBrief() {
  const d = db();
  const day = d.demoDay;
  const items = d.activity.filter((a) => (day > 0 ? a.day === day : a.at.slice(0, 10) === new Date().toISOString().slice(0, 10)));
  const paid = items.filter((a) => a.final === "paid");
  const spent = paid.reduce((s, a) => s + BigInt(a.amount), 0n);
  const blocked = items.filter((a) => a.action === "block");
  const waiting = items.filter((a) => a.final === "pending");
  const rules = d.facts.filter((f) => f.fact.kind === "rule");
  const lines = [
    `${day > 0 ? `Day ${day}` : "Today"}: your agent made ${items.length} purchase requests.`,
    `${paid.length} paid (${fmtUsd(spent)}), ${items.filter((a) => a.action === "pay").length} of them without bothering you.`,
    blocked.length ? `Blocked ${blocked.length}: ${blocked.map((b) => `${b.vendor} ${b.endpoint} — ${b.summary.replace(/^Blocked [^:]+: /, "")}`).join(" · ")}` : "Nothing needed blocking.",
    waiting.length ? `${waiting.length} waiting for you in the inbox.` : "Nothing waiting for you.",
    rules.length ? `Rules I'm following (all from your own words): ${rules.map((r) => r.text.replace(/^Spending rule set by the user: /, "").replace(/\. \(They said.*$/, "")).join("; ")}.` : "No explicit rules yet — I'm learning from your approvals.",
  ];
  return { day, lines };
}
