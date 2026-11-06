import type { Fact, StoredFact, Units } from "../types";

/**
 * Turns recalled memories into the policy Allowance applies right now.
 * Memories are append-only facts; the policy is *derived* from them on every decision,
 * so what Allowance does is always explainable by the memories it recalled.
 */
export interface DerivedPolicy {
  rules: { fact: StoredFact; rule: Extract<Fact, { kind: "rule" }>["rule"] }[];
  approvals: StoredFact[]; // human approvals for this vendor+endpoint
  denials: StoredFact[];
  paid: StoredFact[]; // approvals + auto-paid (for price norms)
  knownPayees: { vendor: string; payTo: string; fact: StoredFact }[]; // all vendors
  vendorPayees: string[]; // payTo addresses remembered for THIS vendor
  learnedLimit?: Units; // auto-pay ceiling learned from repeated approvals
  learnedFrom: StoredFact[];
  ruleLimit?: { amount: Units; fact: StoredFact }; // explicit auto_ok_under rule
  askAbove?: { amount: Units; fact: StoredFact };
  never?: StoredFact;
  dailyBudget?: { amount: Units; fact: StoredFact };
  priceNorm?: Units;
}

const ts = (f: StoredFact) => ("at" in f.fact ? f.fact.at : "");
const max = (xs: bigint[]) => xs.reduce((a, b) => (b > a ? b : a), 0n);
const median = (xs: bigint[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return s[Math.floor(s.length / 2)];
};

export function derivePolicy(
  facts: StoredFact[],
  key: { vendor: string; endpoint: string },
  learnAfterApprovals: number,
): DerivedPolicy {
  const sorted = [...facts].sort((a, b) => ts(a).localeCompare(ts(b)));
  const forKey = sorted.filter((f) => f.fact.kind === "decision" && f.fact.vendor === key.vendor && f.fact.endpoint === key.endpoint);
  const approvals = forKey.filter((f) => f.fact.kind === "decision" && f.fact.by === "human" && f.fact.outcome === "approved");
  const denials = forKey.filter((f) => f.fact.kind === "decision" && f.fact.by === "human" && f.fact.outcome === "denied");
  const paid = forKey.filter((f) => f.fact.kind === "decision" && (f.fact.outcome === "approved" || f.fact.outcome === "auto-paid"));

  const rules = sorted.flatMap((f) => (f.fact.kind === "rule" ? [{ fact: f, rule: f.fact.rule }] : []));
  const scoped = <T extends { vendor?: string }>(r: T) => !r.vendor || r.vendor === key.vendor;
  const last = <T>(xs: T[]) => xs[xs.length - 1];

  const okRule = last(rules.filter((r) => r.rule.type === "auto_ok_under" && scoped(r.rule as any)));
  const askRule = last(rules.filter((r) => r.rule.type === "always_ask_above" && scoped(r.rule as any)));
  const neverRule = last(rules.filter((r) => r.rule.type === "never_pay" && (r.rule as any).vendor === key.vendor));
  const budgetRule = last(rules.filter((r) => r.rule.type === "daily_budget"));

  const knownPayees = sorted.flatMap((f) => {
    if (f.fact.kind === "payee") return [{ vendor: f.fact.vendor, payTo: f.fact.payTo, fact: f }];
    if (f.fact.kind === "decision" && f.fact.by === "human" && f.fact.outcome === "approved") return [{ vendor: f.fact.vendor, payTo: f.fact.payTo, fact: f }];
    return [];
  });
  const vendorPayees = [...new Set(knownPayees.filter((p) => p.vendor === key.vendor).map((p) => p.payTo.toLowerCase()))];

  // Learned trust: N human approvals for this vendor+endpoint set an auto-pay ceiling (the most you approved).
  // A later denial at or below that ceiling revokes it; a denial ABOVE it (e.g. a price spike) leaves routine
  // payments trusted — you said no to the spike, not to the vendor.
  let learnedLimit: Units | undefined;
  let learnedFrom: StoredFact[] = [];
  const lastApproval = last(approvals);
  if (approvals.length >= learnAfterApprovals && lastApproval) {
    const ceiling = max(approvals.map((a) => BigInt((a.fact as any).amount)));
    const laterDenials = denials.filter((dn) => ts(dn) > ts(lastApproval));
    const revoked = laterDenials.some((dn) => BigInt((dn.fact as any).amount) <= ceiling);
    if (!revoked) {
      learnedLimit = ceiling.toString();
      learnedFrom = approvals.slice(-learnAfterApprovals);
    }
  }

  return {
    rules,
    approvals,
    denials,
    paid,
    knownPayees,
    vendorPayees,
    learnedLimit,
    learnedFrom,
    ruleLimit: okRule ? { amount: (okRule.rule as any).amount, fact: okRule.fact } : undefined,
    askAbove: askRule ? { amount: (askRule.rule as any).amount, fact: askRule.fact } : undefined,
    never: neverRule?.fact,
    dailyBudget: budgetRule ? { amount: (budgetRule.rule as any).amount, fact: budgetRule.fact } : undefined,
    priceNorm: median(paid.map((p) => BigInt((p.fact as any).amount)))?.toString(),
  };
}
