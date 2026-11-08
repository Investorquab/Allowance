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

// Admin token (A1). Kept only in the browser; sent as a Bearer header on POST actions.
const TOKEN_KEY = "allowance_admin_token";
const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
};
const setToken = (t: string) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};
const postWithAuth = (url: string, body?: unknown) => {
  const token = getToken();
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
};

const TABS = ["Overview", "Inbox", "Activity", "Memory", "Memory switch", "Try it"] as const;
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

  // Poll slower in live mode (A3): balance reads cost Tatum credits.
  const pollMs = s?.mode === "live" ? 10000 : 4000;
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, pollMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, pollMs]);

  const act = async (label: string, url: string, body?: unknown) => {
    setBusy(label);
    try {
      let r = await postWithAuth(url, body);
      if (r.status === 401) {
        const t = window.prompt("Admin token (ALLOWANCE_ADMIN_TOKEN) is required for this action:", getToken());
        if (t) {
          setToken(t.trim());
          r = await postWithAuth(url, body);
        }
      }
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
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-11 h-11 rounded-xl bg-accent/12 border border-accent/30 text-accent font-mono text-xl leading-none select-none">₳</div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight leading-none">Allowance</h1>
            <p className="text-muted text-sm mt-1.5 max-w-md">A spending steward for your AI agent — it pays the routine, stops the rest, and remembers why.</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-muted text-xs">Agent balance</div>
          <div className={`text-3xl font-semibold nums leading-tight ${s.balanceError ? "text-block" : "text-accent"}`}>{s.balanceFmt ?? "—"}</div>
          <div className="flex flex-wrap justify-end items-center gap-1.5 mt-2 text-xs">
            <Badge tone={s.mode === "live" ? "ok" : "info"}>{s.mode === "live" ? "Live · Sui mainnet" : "Sim · offline"}</Badge>
            {s.mode === "live" ? <HealthBadges s={s} /> : <Badge tone="info">Local memory</Badge>}
          </div>
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
      {tab === "Activity" && <Activity s={s} busy={busy} act={act} />}
      {tab === "Memory" && <Memory s={s} busy={busy} act={act} />}
      {tab === "Memory switch" && <MemorySwitch s={s} />}
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

/** A12: live health at a glance — Tatum reads, Walrus memory, and whether the wallet can cover a payment.
 * Derived from the state we already poll, so it costs no extra Tatum calls (A3). */
function HealthBadges({ s }: { s: State }) {
  let funded = false;
  try { funded = s.balance != null && BigInt(s.balance) >= BigInt(s.limits.hardPerPayment); } catch { funded = false; }
  return (
    <>
      <Badge tone={s.balanceError ? "block" : "ok"}>Tatum {s.balanceError ? "✗" : "✓"}</Badge>
      <Badge tone={s.memoryError ? "ask" : "ok"}>Walrus {s.memoryError ? "degraded" : "✓"}</Badge>
      <Badge tone={funded ? "ok" : "ask"}>{funded ? "Wallet funded ✓" : "Low balance"}</Badge>
    </>
  );
}
function Btn({ children, onClick, disabled, tone = "default" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "default" | "primary" | "danger" }) {
  const c = tone === "primary" ? "bg-accent text-bg hover:opacity-90" : tone === "danger" ? "border border-block/50 text-block hover:bg-block/10" : "border border-line hover:bg-panel-2";
  return <button onClick={onClick} disabled={disabled} className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${c}`}>{children}</button>;
}

function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-panel p-4 ${accent ? "border-accent/30 bg-accent/[0.04]" : "border-line"}`}>
      <div className="text-muted text-xs">{label}</div>
      <div className={`text-[26px] font-semibold mt-1.5 nums leading-none ${accent ? "text-accent" : ""}`}>{value}</div>
      {sub && <div className="text-muted text-xs mt-2">{sub}</div>}
    </div>
  );
}

function Overview({ s, busy, act, goInbox }: { s: State; busy: string | null; act: any; goInbox: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat accent label="Handled without you" value={`${s.totals.autoRate}%`} sub={`${s.totals.requests} requests seen`} />
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
  if (!s.pending.length) return <Panel><p className="text-muted text-sm">Nothing waiting. Allowance only asks when something is new, unusual, or above what you&apos;ve taught it.</p></Panel>;
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
                <div className="text-muted text-sm">Agent&apos;s reason: “{p.request.task}”</div>
                <div className="text-muted text-xs font-mono mt-1">pay-to {r.payTo}</div>
              </div>
              <div className="self-start"><Badge tone="ask">needs you</Badge></div>
            </div>
            <div className="mt-3 grid md:grid-cols-2 gap-4">
              <div><h3 className="text-xs font-medium text-muted mb-1.5">Checks</h3><Checks checks={p.decision.checks} /></div>
              <div><h3 className="text-xs font-medium text-muted mb-1.5">Memories it recalled</h3><Memories items={p.decision.memoriesUsed} /></div>
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

function Activity({ s, busy, act }: { s: State; busy: string | null; act: any }) {
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
                <div className="pt-3"><h3 className="text-xs font-medium text-muted mb-1.5">Checks</h3><Checks checks={a.checks} /></div>
                <div className="pt-3 space-y-3">
                  <div><h3 className="text-xs font-medium text-muted mb-1.5">Memories used</h3><Memories items={a.memoriesUsed} /></div>
                  {a.digest && (
                    <div className="text-xs">
                      <span className="text-muted">tx </span>
                      {a.explorerUrl ? <a className="text-accent underline font-mono" href={a.explorerUrl} target="_blank" rel="noreferrer">{short(a.digest)}</a> : <span className="font-mono">{short(a.digest)}</span>}
                      {a.verified && <span className="ml-2 text-pay">✓ verified by vendor</span>}
                    </div>
                  )}
                  {a.result !== undefined && <pre className="text-[11px] bg-bg border border-line rounded-lg p-2 overflow-auto max-h-40">{JSON.stringify(a.result, null, 2)}</pre>}
                  {a.final === "failed" && (
                    // A14: a payment failed (e.g. dry-run drifted, a 429, or an expired offer). Show the
                    // reason and let the user retry — a fresh errand gets a new 402 nonce and dry-run.
                    <div className="rounded-lg border border-block/40 bg-block/10 p-2 text-xs space-y-2">
                      <p className="text-block">Payment failed. {a.summary?.replace(/^Payment failed:\s*/, "")}</p>
                      {a.url && <Btn disabled={!!busy} onClick={() => act(`retry-${a.requestId}`, "/api/agent/run", { task: a.task, path: a.url })}>{busy === `retry-${a.requestId}` ? "Retrying…" : "Retry payment"}</Btn>}
                    </div>
                  )}
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
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold">What Allowance remembers <span className="text-muted font-normal">· {s.facts.length}</span></span>
          <div className="flex items-center gap-2">
            {s.mode === "live" && <Btn disabled={!!busy} onClick={() => act("sync", "/api/memory/sync")}>{busy === "sync" ? "Syncing…" : "Sync from Walrus"}</Btn>}
            <Btn disabled={!s.facts.length} onClick={() => {
              const blob = new Blob([JSON.stringify(s.facts, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "allowance-memory.json"; a.click(); URL.revokeObjectURL(url);
            }}>Export</Btn>
          </div>
        </div>
        <p className="px-4 pt-2 text-muted text-xs">{s.mode === "live" ? "Your memory lives on Walrus, not this server. Sync pulls it all back here — proof it's portable and yours." : "Local memory (sim mode)."}</p>
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

function ActionPill({ action }: { action: string }) {
  const tone = action === "pay" ? "ok" : action === "block" ? "block" : "ask";
  const label = action === "pay" ? "Pays on its own" : action === "block" ? "Blocks" : "Asks you";
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${LEVEL[tone as keyof typeof LEVEL]}`}>{label}</span>;
}

function DecisionCard({ title, subtitle, decision, highlight }: { title: string; subtitle: string; decision: any; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-accent/40 bg-accent/[0.04]" : "border-line bg-panel"}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-muted text-xs">{subtitle}</div>
        </div>
        <ActionPill action={decision.action} />
      </div>
      <p className="text-sm text-text/90 mb-3">{decision.summary}</p>
      <div className="space-y-3">
        <div><h3 className="text-xs font-medium text-muted mb-1.5">Checks</h3><Checks checks={decision.checks} /></div>
        <div><h3 className="text-xs font-medium text-muted mb-1.5">Memories it used</h3><Memories items={decision.memoriesUsed} /></div>
      </div>
    </div>
  );
}

function MemorySwitch({ s }: { s: State }) {
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, path: string) => {
    setBusy(label);
    try {
      const r = await fetch("/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
      setRes(await r.json());
    } catch { setRes({ error: "Could not compare — is the app running?" }); } finally { setBusy(null); }
  };
  const scenarios = [
    { label: "Chainlens wallet report", path: `/api/vendors/chainlens/wallet-report?address=0x${rnd()}` },
    { label: "DataPulse market brief", path: `/api/vendors/datapulse/market-brief?token=SUI&n=${rnd().slice(0, 6)}` },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <h2 className="font-semibold">Why memory matters</h2>
        <p className="text-muted text-sm mt-1 mb-3">The same payment, decided two ways — with everything Allowance has learned (recalled from {s.mode === "live" ? "Walrus" : "memory"}) and with no memory at all. Memory is what turns &ldquo;ask me every time&rdquo; into &ldquo;just handle it&rdquo;.</p>
        <div className="flex flex-wrap gap-2">
          {scenarios.map((x) => <Btn key={x.label} tone="primary" disabled={!!busy} onClick={() => run(x.label, x.path)}>{busy === x.label ? "Deciding…" : `Compare: ${x.label}`}</Btn>)}
        </div>
      </Panel>
      {res?.error && <Panel><p className="text-block text-sm">{res.error}</p></Panel>}
      {res && !res.error && (
        <>
          <div className="text-muted text-xs px-1">{usd(res.requirement.amount)} to {res.requirement.vendorName} · recalled <span className="text-accent">{res.memoriesRecalled}</span> {res.memoriesRecalled === 1 ? "memory" : "memories"} from {s.mode === "live" ? "Walrus mainnet" : "local memory"}</div>
          <div className="grid md:grid-cols-2 gap-3">
            <DecisionCard title="Without memory" subtitle="a fresh agent — nothing learned" decision={res.withoutMemory} />
            <DecisionCard title="With memory" subtitle={`recalled ${res.memoriesRecalled} from Walrus`} decision={res.withMemory} highlight />
          </div>
        </>
      )}
    </div>
  );
}

const SCENARIOS: { label: string; task: string; path: () => string; attack?: string }[] = [
  { label: "Routine: Chainlens wallet report", task: "Routine wallet check", path: () => `/api/vendors/chainlens/wallet-report?address=0x${rnd()}` },
  { label: "Routine: DataPulse market brief", task: "Daily market brief", path: () => `/api/vendors/datapulse/market-brief?token=SUI&n=${rnd().slice(0, 6)}` },
  { label: "Real API: SUI spot price (PriceWire)", task: "Live SUI price from a real external API", path: () => `/api/vendors/pricewire/spot?token=sui&n=${rnd().slice(0, 6)}` },
  { label: "Price spike (DataPulse ×6)", task: "Market brief (vendor raised prices)", path: () => `/api/vendors/datapulse/market-brief?token=SUI&surge=6&n=${rnd().slice(0, 6)}` },
  { label: "Scam: look-alike “DataPulse”", task: "Market brief from a forum link", path: () => `/api/vendors/datapu1se/market-brief?token=SUI&n=${rnd().slice(0, 6)}`, attack: "datapulse" },
  { label: "Redirected invoice (Chainlens)", task: "Portfolio check — vendor sent new pay address", path: () => `/api/vendors/chainlens/portfolio?address=0x${rnd()}&payto=new`, attack: "chainlens" },
  { label: "Expensive: DataPulse deep-dive", task: "Long research report", path: () => `/api/vendors/datapulse/deep-dive?token=DEEP&n=${rnd().slice(0, 6)}` },
];
function rnd() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function TryIt({ s, busy, act }: { s: State; busy: string | null; act: any }) {
  const [last, setLast] = useState<string | null>(null);
  const [addr, setAddr] = useState("");
  // In live mode, don't let an attack scenario run until its real vendor is known (A2):
  // before that it would surface as a new payee and risk sending real USDC on approval.
  const knownVendors = new Set<string>((s.facts ?? []).filter((f: any) => f.fact?.kind === "payee").map((f: any) => f.fact.vendor));
  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <h2 className="font-semibold">Send the agent on an errand</h2>
        <p className="text-muted text-xs mb-3">Each button makes the agent call a paid API. The vendor replies “402 Payment Required” and Allowance decides: pay, ask you, or block.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SCENARIOS.map((x) => {
            const path = x.path();
            const locked = s.mode === "live" && x.attack && !knownVendors.has(x.attack);
            return <Btn key={x.label} disabled={!!busy || !!locked} onClick={async () => { setLast(x.label); await act(x.label, "/api/agent/run", { task: x.task, path }); }}>{busy === x.label ? "Working…" : locked ? `${x.label} (pay the real ${x.attack} first)` : x.label}</Btn>;
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
