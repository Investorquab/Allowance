import { getCachedBalance, setCachedBalance } from "./balance-cache";
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
  const balKey = `${chain.agentAddress()}|${config.usdcCoinType}`;
  try {
    // Live balance reads are metered (Tatum); cache for 30s (A3). Sim is free, so read fresh.
    const cached = config.mode === "live" ? getCachedBalance(balKey) : null;
    if (cached !== null) {
      balance = cached;
    } else {
      balance = await chain.getBalance(chain.agentAddress(), config.usdcCoinType);
      if (config.mode === "live") setCachedBalance(balKey, balance);
    }
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

  // Per-job spend: group the API calls of one agent run so you can see what a run cost in total and
  // which step ran up the bill. Newest job first; only activity tagged with a jobId is included.
  const jobMap = new Map<string, {
    jobId: string; label: string; at: string; day: number;
    steps: { requestId: string; vendor: string; endpoint: string; task: string; amount: string; action: string; final: string }[];
  }>();
  for (const a of d.activity) {
    if (!a.jobId) continue;
    const j = jobMap.get(a.jobId) ?? { jobId: a.jobId, label: a.jobLabel ?? "Agent run", at: a.at, day: a.day, steps: [] };
    if (a.at < j.at) j.at = a.at;
    j.steps.push({ requestId: a.requestId, vendor: a.vendor, endpoint: a.endpoint, task: a.task, amount: a.amount, action: a.action, final: a.final });
    jobMap.set(a.jobId, j);
  }
  const jobs = [...jobMap.values()]
    .map((j) => {
      const paidSteps = j.steps.filter((s) => s.final === "paid");
      const spent = paidSteps.reduce((sum, s) => sum + BigInt(s.amount), 0n);
      const top = paidSteps.reduce<(typeof paidSteps)[number] | null>((m, s) => (!m || BigInt(s.amount) > BigInt(m.amount) ? s : m), null);
      return {
        ...j,
        // Costliest step first, so the one that ran up the bill is at the top.
        steps: [...j.steps].sort((x, y) => (BigInt(y.amount) > BigInt(x.amount) ? 1 : BigInt(y.amount) < BigInt(x.amount) ? -1 : 0)),
        spent: spent.toString(),
        stepCount: j.steps.length,
        paid: paidSteps.length,
        asked: j.steps.filter((s) => s.action === "ask").length,
        blocked: j.steps.filter((s) => s.action === "block").length,
        topStepRequestId: top?.requestId ?? null,
      };
    })
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

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
    jobs,
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
    tatumCalls: (chain as any).calls?.length ?? null,
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
