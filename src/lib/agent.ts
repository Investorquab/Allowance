import crypto from "node:crypto";
import { getConfig } from "./config";
import { evaluate, pay, recordAutoPaid } from "./guard";
import { services } from "./services";
import { db, save } from "./store";
import { handleVendor } from "./vendor-server";
import { encodePayment, parsePaymentRequired, X402_VERSION } from "./x402";

/**
 * A small research agent that buys data from paid APIs.
 * Every time a vendor answers 402, the agent asks Allowance — it never decides to pay on its own.
 */
export interface AgentTask {
  task: string; // why (shown to the human)
  path: string; // e.g. /api/vendors/chainlens/wallet-report?address=0x…
}

export type TaskOutcome =
  | { status: "free"; data: unknown }
  | { status: "paid"; requestId: string; digest: string; data: unknown }
  | { status: "pending"; requestId: string; summary: string }
  | { status: "blocked"; requestId: string; summary: string }
  | { status: "error"; error: string };

/** In-process fetch for our own vendor routes (no HTTP hop); anything else goes over the network. */
async function agentFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const u = new URL(url);
  const m = u.pathname.match(/^\/api\/vendors\/([^/]+)\/([^/]+)$/);
  if (m && u.origin === new URL(getConfig().baseUrl).origin) return handleVendor(new Request(url, { headers }), m[1], m[2]);
  return fetch(url, { headers });
}

const fingerprintOf = (url: string) => {
  const u = new URL(url);
  u.searchParams.delete("surge");
  u.searchParams.delete("payto");
  u.searchParams.sort();
  return crypto.createHash("sha256").update(u.pathname + "?" + u.searchParams.toString()).digest("hex").slice(0, 16);
};

export async function runTask(t: AgentTask, agent = "research-agent"): Promise<TaskOutcome> {
  const url = new URL(t.path, getConfig().baseUrl).toString();
  try {
    const first = await agentFetch(url);
    if (first.status !== 402) return { status: "free", data: await first.json() };
    const requirement = parsePaymentRequired(await first.json());
    if (!requirement) return { status: "error", error: "Vendor sent an unreadable 402" };

    const { request, decision, prepared } = await evaluate({ agent, task: t.task, requirement, fingerprint: fingerprintOf(url) });
    const act = db().activity.find((a) => a.requestId === request.id)!;
    act.url = url;
    save();
    if (decision.action === "block") return { status: "blocked", requestId: request.id, summary: decision.summary };
    if (decision.action === "ask") return { status: "pending", requestId: request.id, summary: decision.summary };

    // Auto-pay: reuse the tx evaluate just built (see pay()); it was dry-run-matched in decide().
    const { digest } = await pay(request.id, prepared);
    await recordAutoPaid(request, decision);
    const data = await fetchPaid(request.id, digest);
    return { status: "paid", requestId: request.id, digest, data };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Retry the original call with proof of payment (after auto-pay, or after a human approved). */
export async function fetchPaid(requestId: string, digest: string) {
  const d = db();
  const req = d.requests[requestId];
  const act = d.activity.find((a) => a.requestId === requestId)!;
  const { chain, config } = services();
  const header = encodePayment({
    x402Version: X402_VERSION, scheme: "exact", network: config.network,
    payload: { digest, payer: chain.agentAddress(), nonce: req.requirement.nonce },
  });
  const res = await agentFetch(act.url ?? req.requirement.resource, { "x-payment": header });
  const body = await res.json();
  act.result = res.ok ? (body as any).data : { error: (body as any).error ?? `vendor said ${res.status}` };
  save();
  return act.result;
}
