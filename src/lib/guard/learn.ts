import { toUnits } from "../config";
import type { Fact, PaymentRequest } from "../types";

type Rule = Extract<Fact, { kind: "rule" }>["rule"];

/**
 * Turns a short human note into explicit rules. Deliberately simple and predictable —
 * the note is ALSO stored verbatim, so nothing the user said is lost.
 *   "fine, auto-approve under $0.05 from them" → auto_ok_under 50000 (vendor)
 *   "ask me above 20 cents"                    → always_ask_above 200000
 *   "never pay these guys"                     → never_pay (vendor)
 *   "keep it under $2 a day"                   → daily_budget 2000000
 */
export function parseRules(note: string, vendor: string): Rule[] {
  const n = note.toLowerCase();
  const money = (s: string) => {
    const m = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(cents?|c\b)?/);
    if (!m) return undefined;
    const v = Number(m[1]);
    return toUnits(m[2] ? v / 100 : v);
  };
  const forVendor = /\b(them|they|this vendor|from them|for them|this one|these guys)\b/.test(n);
  const out: Rule[] = [];

  if (/\bnever\b.*\b(pay|use|buy|again)\b|\bblock (them|this vendor)\b/.test(n)) out.push({ type: "never_pay", vendor });

  const day = n.match(/(?:budget|max|limit|keep (?:it|spending)? ?under|no more than)[^$\d]*(\$?\s*\d+(?:\.\d+)?\s*(?:cents?)?)\s*(?:a|per|\/)\s*day/);
  if (day) out.push({ type: "daily_budget", amount: money(day[1])! });

  const ok = n.match(/(?:auto|always ok|fine|approve|ok|okay|go ahead)[^$\d]*(?:under|below|less than|up to|<=?)\s*(\$?\s*\d+(?:\.\d+)?\s*(?:cents?)?)/);
  if (ok && !day) out.push({ type: "auto_ok_under", amount: money(ok[1])!, ...(forVendor ? { vendor } : {}) });

  const ask = n.match(/(?:ask|check|ping|confirm)[^$\d]*(?:above|over|more than|>)\s*(\$?\s*\d+(?:\.\d+)?\s*(?:cents?)?)/);
  if (ask) out.push({ type: "always_ask_above", amount: money(ask[1])!, ...(forVendor ? { vendor } : {}) });

  return out.filter((r) => !("amount" in r) || (r.amount && r.amount !== "0"));
}

/** Facts to write when a human answers an ask. */
export function factsFromHumanDecision(
  req: PaymentRequest,
  outcome: "approved" | "denied",
  note: string | undefined,
  knownPayee: boolean,
  now = new Date(),
): Fact[] {
  const r = req.requirement;
  const at = now.toISOString();
  const facts: Fact[] = [
    { kind: "decision", vendor: r.vendor, endpoint: r.endpoint, payTo: r.payTo, amount: r.amount, outcome, by: "human", note: note || undefined, at },
  ];
  if (outcome === "approved" && !knownPayee) facts.push({ kind: "payee", vendor: r.vendor, payTo: r.payTo, label: r.vendorName, at });
  if (note) for (const rule of parseRules(note, r.vendor)) facts.push({ kind: "rule", rule, source: note, at });
  return facts;
}
