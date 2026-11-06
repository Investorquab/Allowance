"use client";

import { useCallback, useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type State = any;

const usd = (units: string | number | undefined) => {
  if (units === undefined || units === null) return "—";
  const n = Number(units) / 1e6;
  return `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
};
const short = (a?: string) => (a && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a ?? "");

const TABS = ["Overview", "Inbox", "Activity", "Memory", "Try it"] as const;
type Tab = (typeof TABS)[number];

const LEVEL = {
  block: "text-block border-block/40 bg-block/10",
  ask: "text-ask border-ask/40 bg-ask/10",
  ok: "text-pay border-pay/40 bg-pay/10",
  info: "text-muted border-line bg-panel-2",
} as const;
const FINAL: Record<string, string> = {
  paid: "text-pay bg-pay/10 border-pay/40",
  pending: "text-ask bg-ask/10 border-ask/40",
  denied: "text-muted bg-panel-2 border-line",
  blocked: "text-block bg-block/10 border-block/40",
  failed: "text-block bg-block/10 border-block/40",
};

export default function Dashboard() {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    const j = await r.json();
    if (j.error) setErr(j.error);
    else {
      setErr(null);
      setS(j);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (label: string, url: string, body?: unknown) => {
    setBusy(label);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && j.error) setErr(j.error);
    } finally {
      setBusy(null);
      load();
    }
  };

  if (err && !s) return <Shell><Panel><p className="text-block">Could not load: {err}</p><p className="text-muted mt-2 text-sm">In live mode, check your .env.local (see CHECKLIST.md §D).</p></Panel></Shell>;
  if (!s) return <Shell><p className="text-muted">Loading…</p></Shell>;

  const pendingCount = s.pending.length;
  return (
    <Shell>
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Allowance</h1>
          <p className="text-muted text-sm">Your agent pays for what it needs, asks you about the rest, and remembers your rules.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={s.mode === "live" ? "ok" : "info"}>{s.mode === "live" ? "LIVE · Sui mainnet" : "SIM · offline"}</Badge>
          <Badge tone="info">{s.chain}</Badge>
          <Badge tone="info">{s.memory}</Badge>
          <Badge tone={s.balanceError ? "block" : "info"}>Agent wallet {s.balanceFmt ?? "?"}</Badge>
        </div>
      </header>

      {err && <div className="rounded-lg border border-block/40 bg-block/10 text-block text-sm px-3 py-2">{err}</div>}
      {s.memoryError && <div className="rounded-lg border border-ask/40 bg-ask/10 text-ask text-sm px-3 py-2">Walrus recall failed, using local mirror: {s.memoryError}</div>}

      <nav className="flex gap-1 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? "border-accent text-text" : "border-transparent text-muted hover:text-text"}`}>
            {t}{t === "Inbox" && pendingCount > 0 && <span className="ml-1.5 rounded-full bg-ask text-bg text-[10px] font-bold px-1.5">{pendingCount}</span>}
          </button>
        ))}
      </nav>

      {tab === "Overview" && <Overview s={s} busy={busy} act={act} goInbox={() => setTab("Inbox")} />}
      {tab === "Inbox" && <Inbox s={s} busy={busy} act={act} />}
      {tab === "Activity" && <Activity s={s} />}
      {tab === "Memory" && <Memory s={s} busy={busy} act={act} />}
      {tab === "Try it" && <TryIt s={s} busy={busy} act={act} />}

      <footer className="text-muted text-xs pt-6 border-t border-line">
        Agent {short(s.agentAddress)} · hard caps {usd(s.limits.hardPerPayment)}/payment, {usd(s.limits.hardDaily)}/day · learns after {s.limits.learnAfterApprovals} approvals
        {s.tatumCalls !== null && <> · {s.tatumCalls} Tatum RPC calls this session</>}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl px-4 py-6 flex flex-col gap-5">{children}</main>;
}
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-panel p-4 ${className}`}>{children}</section>;
}
function Badge({ children, tone = "info" }: { children: React.ReactNode; tone?: keyof typeof LEVEL }) {
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 ${LEVEL[tone]}`}>{children}</span>;
}
function Btn({ children, onClick, disabled, tone = "default" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "default" | "primary" | "danger" }) {
  const c = tone === "primary" ? "bg-accent text-bg hover:opacity-90" : tone === "danger" ? "border border-block/50 text-block hover:bg-block/10" : "border border-line hover:bg-panel-2";
  return <button onClick={onClick} disabled={disabled} className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${c}`}>{children}</button>;
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-muted text-xs mt-1">{sub}</div>}
    </div>
  );
}

function Overview({ s, busy, act, goInbox }: { s: State; busy: string | null; act: any; goInbox: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Handled without you" value={`${s.totals.autoRate}%`} sub={`${s.totals.requests} requests`} />
        <Stat label="Spent" value={usd(s.totals.spent)} sub={`${s.totals.paid} payments · today ${usd(s.spentToday)}`} />
        <Stat label="Blocked" value={s.totals.blocked} sub="scams, duplicates, redirects" />
        <Stat label="Memories" value={s.totals.memories} sub={s.mode === "live" ? `${s.totals.onWalrus} on Walrus mainnet` : "local (sim)"} />
      </div>

      {s.pending.length > 0 && (
        <button onClick={goInbox} className="text-left rounded-xl border border-ask/40 bg-ask/10 p-3 text-ask text-sm">
          {s.pending.length} payment{s.pending.length > 1 ? "s" : ""} waiting for you → open Inbox
        </button>
      )}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-semibold">How often it had to ask you</h2>
            <p className="text-muted text-xs">Each day the agent buys data. Fewer asks over time = Allowance learned your rules (stored in memory).</p>
          </div>
          <div className="flex gap-2">
            <Btn onClick={() => act("day", "/api/demo", { action: "run-day" })} disabled={!!busy}>{busy === "day" ? "Running…" : `Run agent: day ${s.demoDay + 1}`}</Btn>
            <Btn tone="primary" onClick={() => act("week", "/api/demo", { action: "simulate-week" })} disabled={!!busy}>{busy === "week" ? "Simulating…" : "Simulate a week"}</Btn>
          </div>
        </div>
        <LearningChart series={s.series} />
      </Panel>

      <Panel>
        <h2 className="font-semibold mb-2">Morning brief {s.brief?.day > 0 && <span className="text-muted font-normal text-sm">· day {s.brief.day}</span>}</h2>
        {s.totals.requests === 0 ? <p className="text-muted text-sm">Nothing yet. Run the agent to start.</p> : (
          <ul className="text-sm space-y-1.5">{s.brief.lines.map((l: string, i: number) => <li key={i} className="leading-relaxed">{l}</li>)}</ul>
        )}
      </Panel>

      {s.mode === "sim" && (
        <div className="flex justify-end">
          <Btn tone="danger" onClick={() => confirm("Reset all sim data?") && act("reset", "/api/demo", { action: "reset" })} disabled={!!busy}>Reset sim data</Btn>
        </div>
      )}
    </div>
  );
}

function LearningChart({ series }: { series: any[] }) {
  if (!series.length) return <p className="text-muted text-sm py-8 text-center">No data yet.</p>;
  const max = Math.max(1, ...series.map((r) => r.asked + r.auto + r.blocked));
  return (
    <div>
      <div className="flex items-end gap-2 h-44 border-b border-line pb-1">
        {series.map((r) => {
          const tot = r.asked + r.auto + r.blocked;
          return (
            <div key={r.day} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${r.day}: asked ${r.asked}, auto ${r.auto}, blocked ${r.blocked}`}>
              <span className="text-[11px] text-ask font-semibold tabular-nums">{r.asked}</span>
              <div className="w-full max-w-12 flex flex-col-reverse rounded-md overflow-hidden" style={{ height: `${(tot / max) * 100}%` }}>
                <div className="bg-ask" style={{ flex: r.asked }} />
                <div className="bg-pay/80" style={{ flex: r.auto }} />
                <div className="bg-block/80" style={{ flex: r.blocked }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1">{series.map((r) => <div key={r.day} className="flex-1 text-center text-[11px] text-muted">{r.day}</div>)}</div>
      <div className="flex gap-4 text-xs text-muted mt-3">
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-ask mr-1" />asked you</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-pay/80 mr-1" />paid on its own</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-block/80 mr-1" />blocked</span>
      </div>
    </div>
  );
}

function Checks({ checks }: { checks: any[] }) {
  return (
    <ul className="space-y-1">
      {checks.map((c, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className={`shrink-0 rounded border px-1.5 text-[10px] font-mono leading-5 ${LEVEL[c.level as keyof typeof LEVEL]}`}>{c.code}</span>
          <span className="text-text/90">{c.message}</span>
        </li>
      ))}
    </ul>
  );
}
function Memories({ items }: { items: any[] }) {
  if (!items?.length) return <p className="text-muted text-xs">No memories used: nothing learned about this yet.</p>;
  return (
    <ul className="space-y-1">
      {items.map((m) => (
        <li key={m.id} className="text-xs text-muted flex gap-2">
          <span className="shrink-0 text-accent">◆</span>
          <span>{m.text}{m.blobId && <span className="ml-1 font-mono text-[10px] text-accent/80">walrus:{short(m.blobId)}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

const SUGGESTIONS = ["auto-approve under 5 cents from them", "ask me above $0.20", "never pay them again", "keep it under $2 a day"];

function Inbox({ s, busy, act }: { s: State; busy: string | null; act: any }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!s.pending.length) return <Panel><p className="text-muted text-sm">Nothing waiting. Allowance only asks when something is new, unusual, or above what you've taught it.</p></Panel>;
  return (
    <div className="flex flex-col gap-3">
      {s.pending.map((p: any) => {
        const r = p.request.requirement;
        const note = notes[p.requestId] ?? "";
        return (
          <Panel key={p.requestId}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{usd(r.amount)} to {r.vendorName} <span className="text-muted font-normal text-sm">· {r.endpoint}</span></div>
                <div className="text-muted text-sm">Agent's reason: “{p.request.task}”</div>
                <div className="text-muted text-xs font-mono mt-1">pay-to {r.payTo}</div>
              </div>
              <div className="self-start"><Badge tone="ask">needs you</Badge></div>
            </div>
            <div className="mt-3 grid md:grid-cols-2 gap-4">
              <div><h3 className="text-xs uppercase tracking-wide text-muted mb-1.5">Checks</h3><Checks checks={p.decision.checks} /></div>
              <div><h3 className="text-xs uppercase tracking-wide text-muted mb-1.5">Memories it recalled</h3><Memories items={p.decision.memoriesUsed} /></div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <input value={note} onChange={(e) => setNotes({ ...notes, [p.requestId]: e.target.value })}
                placeholder="Optional: tell it a rule (it will remember)…"
                className="w-full rounded-lg bg-panel-2 border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((x) => <button key={x} onClick={() => setNotes({ ...notes, [p.requestId]: x })} className="text-xs rounded-full border border-line px-2 py-0.5 text-muted hover:text-text">{x}</button>)}
              </div>
              <div className="flex gap-2 justify-end">
                <Btn tone="danger" disabled={!!busy} onClick={() => act(`deny-${p.requestId}`, `/api/approvals/${p.requestId}`, { outcome: "denied", note })}>Deny</Btn>
                <Btn tone="primary" disabled={!!busy} onClick={() => act(`ok-${p.requestId}`, `/api/approvals/${p.requestId}`, { outcome: "approved", note })}>{busy === `ok-${p.requestId}` ? "Paying…" : "Approve & pay"}</Btn>
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Activity({ s }: { s: State }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!s.activity.length) return <Panel><p className="text-muted text-sm">No activity yet.</p></Panel>;
  return (
    <Panel className="p-0">
      <ul className="divide-y divide-line">
        {s.activity.map((a: any) => (
          <li key={a.requestId}>
            <button onClick={() => setOpen(open === a.requestId ? null : a.requestId)} className="w-full text-left px-4 py-3 hover:bg-panel-2 flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className={`text-[11px] rounded border px-1.5 ${FINAL[a.final]}`}>{a.final}</span>
              <span className="font-medium">{usd(a.amount)}</span>
              <span>{a.vendor} <span className="text-muted">· {a.endpoint}</span></span>
              <span className="text-muted text-xs ml-auto">{a.day > 0 ? `Day ${a.day}` : new Date(a.at).toLocaleTimeString()}</span>
              <span className="basis-full text-sm text-muted">{a.summary}</span>
            </button>
            {open === a.requestId && (
              <div className="px-4 pb-4 grid md:grid-cols-2 gap-4 bg-panel-2/40">
                <div className="pt-3"><h3 className="text-xs uppercase tracking-wide text-muted mb-1.5">Checks</h3><Checks checks={a.checks} /></div>
                <div className="pt-3 space-y-3">
                  <div><h3 className="text-xs uppercase tracking-wide text-muted mb-1.5">Memories used</h3><Memories items={a.memoriesUsed} /></div>
                  {a.digest && (
                    <div className="text-xs">
                      <span className="text-muted">tx </span>
                      {a.explorerUrl ? <a className="text-accent underline font-mono" href={a.explorerUrl} target="_blank" rel="noreferrer">{short(a.digest)}</a> : <span className="font-mono">{short(a.digest)}</span>}
                      {a.verified && <span className="ml-2 text-pay">✓ verified by vendor</span>}
                    </div>
                  )}
                  {a.result !== undefined && <pre className="text-[11px] bg-bg border border-line rounded-lg p-2 overflow-auto max-h-40">{JSON.stringify(a.result, null, 2)}</pre>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const KIND: Record<string, keyof typeof LEVEL> = { rule: "ok", decision: "info", payee: "info", note: "ask" };

function Memory({ s, busy, act }: { s: State; busy: string | null; act: any }) {
  const [text, setText] = useState("");
  const [vendor, setVendor] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <h2 className="font-semibold">Tell it a rule</h2>
        <p className="text-muted text-xs mb-2">Plain words. Stored in {s.mode === "live" ? "Walrus Memory on mainnet" : "memory"} and recalled before every payment.</p>
        <div className="flex flex-wrap gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. keep it under $2 a day" className="flex-1 min-w-48 rounded-lg bg-panel-2 border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
          <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="rounded-lg bg-panel-2 border border-line px-2 text-sm">
            <option value="">any vendor</option><option value="chainlens">Chainlens</option><option value="datapulse">DataPulse</option><option value="datapu1se">datapu1se (scam)</option>
          </select>
          <Btn tone="primary" disabled={!text || !!busy} onClick={async () => { await act("mem", "/api/memory", { text, vendor }); setText(""); }}>Remember</Btn>
        </div>
      </Panel>
      <Panel className="p-0">
        <div className="px-4 py-3 border-b border-line flex justify-between text-sm"><span className="font-semibold">What Allowance remembers</span><span className="text-muted">{s.facts.length} memories</span></div>
        {!s.facts.length ? <p className="text-muted text-sm p-4">Nothing yet.</p> : (
          <ul className="divide-y divide-line">
            {s.facts.map((f: any) => (
              <li key={f.id} className="px-4 py-2.5 flex gap-3 items-start text-sm">
                <Badge tone={KIND[f.fact.kind]}>{f.fact.kind}</Badge>
                <span className="flex-1">{f.text}</span>
                {f.blobId && <span className="font-mono text-[10px] text-accent/80 shrink-0" title={f.blobId}>walrus:{short(f.blobId)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

const SCENARIOS = [
  { label: "Routine: Chainlens wallet report", task: "Routine wallet check", path: () => `/api/vendors/chainlens/wallet-report?address=0x${rnd()}` },
  { label: "Routine: DataPulse market brief", task: "Daily market brief", path: () => `/api/vendors/datapulse/market-brief?token=SUI&n=${rnd().slice(0, 6)}` },
  { label: "Price spike (DataPulse ×6)", task: "Market brief (vendor raised prices)", path: () => `/api/vendors/datapulse/market-brief?token=SUI&surge=6&n=${rnd().slice(0, 6)}` },
  { label: "Scam: look-alike “DataPulse”", task: "Market brief from a forum link", path: () => `/api/vendors/datapu1se/market-brief?token=SUI&n=${rnd().slice(0, 6)}` },
  { label: "Redirected invoice (Chainlens)", task: "Portfolio check — vendor sent new pay address", path: () => `/api/vendors/chainlens/portfolio?address=0x${rnd()}&payto=new` },
  { label: "Expensive: DataPulse deep-dive", task: "Long research report", path: () => `/api/vendors/datapulse/deep-dive?token=DEEP&n=${rnd().slice(0, 6)}` },
];
function rnd() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function TryIt({ s, busy, act }: { s: State; busy: string | null; act: any }) {
  const [last, setLast] = useState<string | null>(null);
  const [addr, setAddr] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <h2 className="font-semibold">Send the agent on an errand</h2>
        <p className="text-muted text-xs mb-3">Each button makes the agent call a paid API. The vendor replies “402 Payment Required” and Allowance decides: pay, ask you, or block.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SCENARIOS.map((x) => {
            const path = x.path();
            return <Btn key={x.label} disabled={!!busy} onClick={async () => { setLast(x.label); await act(x.label, "/api/agent/run", { task: x.task, path }); }}>{busy === x.label ? "Working…" : x.label}</Btn>;
          })}
        </div>
        {last && <p className="text-xs text-muted mt-3">Sent: {last}. Check Activity or Inbox.</p>}
      </Panel>
      {s.mode === "live" && (
        <Panel>
          <h2 className="font-semibold">Real data: look up any Sui address</h2>
          <p className="text-muted text-xs mb-2">Chainlens serves live mainnet data through Tatum, paid per call in USDC.</p>
          <div className="flex gap-2">
            <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x… Sui address" className="flex-1 rounded-lg bg-panel-2 border border-line px-3 py-2 text-sm font-mono" />
            <Btn tone="primary" disabled={!addr || !!busy} onClick={() => act("lookup", "/api/agent/run", { task: `Look up ${short(addr)}`, path: `/api/vendors/chainlens/wallet-report?address=${addr}` })}>Buy report</Btn>
          </div>
        </Panel>
      )}
      <Panel>
        <h2 className="font-semibold mb-1">Use Allowance from your own agent</h2>
        <pre className="text-[11px] bg-bg border border-line rounded-lg p-3 overflow-auto">{`POST /api/agent/run
{ "task": "why the agent needs it", "path": "/api/vendors/chainlens/wallet-report?address=0x…" }

→ { "status": "paid" | "pending" | "blocked", "requestId": "…", "data": … }`}</pre>
      </Panel>
    </div>
  );
}
