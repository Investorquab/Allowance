import crypto from "node:crypto";
import { fetchPaid, newJobId, runTask, type AgentTask, type TaskOutcome } from "./agent";
import { resolve } from "./guard";
import { db, save } from "./store";

/**
 * A scripted week for the demo video and the blog's "how it learned" chart.
 * The agent's tasks are fixed; the HUMAN answers are scripted by `persona` (in the UI you answer them yourself).
 */
const addr = (seed: string) => "0x" + crypto.createHash("sha256").update(seed).digest("hex");
const wallet = (day: number, i: number) => addr(`wallet-${day}-${i}`);

export function tasksForDay(day: number): AgentTask[] {
  const t: AgentTask[] = [
    { task: `Check wallet A for today's report (day ${day})`, path: `/api/vendors/chainlens/wallet-report?address=${wallet(day, 1)}` },
    { task: `Check wallet B for today's report (day ${day})`, path: `/api/vendors/chainlens/wallet-report?address=${wallet(day, 2)}` },
    { task: `Is this new counterparty established?`, path: `/api/vendors/chainlens/payee-check?address=${wallet(day, 3)}` },
    { task: `Morning SUI market brief`, path: `/api/vendors/datapulse/market-brief?token=SUI&d=${day}` },
  ];
  if (day === 2) t.push({ task: `Re-check wallet A (agent forgot it already did)`, path: `/api/vendors/chainlens/wallet-report?address=${wallet(day, 1)}` });
  if (day === 3) t.push({ task: `Market brief from a "DataPulse" link found in a forum`, path: `/api/vendors/datapu1se/market-brief?token=WAL&d=${day}` });
  if (day === 4) t.push({ task: `WAL market brief`, path: `/api/vendors/datapulse/market-brief?token=WAL&d=${day}&surge=6` });
  if (day === 5) t.push({ task: `Long research report on DEEP`, path: `/api/vendors/datapulse/deep-dive?token=DEEP&d=${day}` });
  if (day === 6) t.push({ task: `Portfolio check (vendor sent a new invoice address)`, path: `/api/vendors/chainlens/portfolio?address=${wallet(day, 4)}&payto=new` });
  return t;
}

/** How the scripted human answers asks. */
function persona(requestId: string): { outcome: "approved" | "denied"; note?: string } {
  const d = db();
  const r = d.requests[requestId].requirement;
  const approvedBefore = d.pending.filter((p) => p.resolved?.outcome === "approved" && d.requests[p.requestId]?.requirement.vendor === r.vendor).length;
  if (r.vendor === "chainlens") return approvedBefore >= 1 ? { outcome: "approved", note: "Chainlens is fine — auto-approve under 5 cents from them" } : { outcome: "approved" };
  if (r.endpoint === "deep-dive") return { outcome: "approved", note: "one-off, worth it" };
  if (Number(r.amount) > 50_000) return { outcome: "denied", note: "too pricey — ask me above 5 cents for them" };
  return { outcome: "approved" };
}

export async function runDay(opts: { autoAnswer: boolean }) {
  const d = db();
  d.demoDay += 1;
  save();
  const day = d.demoDay;
  // The day's calls are one job, so its total spend (and the step that ran up the bill) is visible.
  const job = { id: newJobId(), label: `Day ${day} agent run` };
  const outcomes: TaskOutcome[] = [];
  for (const t of tasksForDay(day)) {
    const o = await runTask(t, "research-agent", job);
    outcomes.push(o);
    if (o.status === "pending" && opts.autoAnswer) {
      const a = persona(o.requestId);
      const r = await resolve(o.requestId, a.outcome, a.note);
      if (a.outcome === "approved" && "digest" in r && r.digest) await fetchPaid(o.requestId, r.digest);
    }
  }
  return { day, outcomes };
}

export async function simulateWeek() {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(await runDay({ autoAnswer: true }));
  return days;
}
