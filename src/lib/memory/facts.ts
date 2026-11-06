import { fmtUsd } from "../config";
import type { Fact } from "../types";

const TAG = "[allowance:v1]";
const SEP = " ::json:: ";

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a);

/** Human-readable sentence first (so semantic recall works), machine JSON after. */
export function describe(f: Fact): string {
  switch (f.kind) {
    case "decision": {
      const who = f.by === "human" ? (f.outcome === "approved" ? "The user approved" : "The user denied") : f.outcome === "auto-paid" ? "Allowance auto-paid" : "Allowance blocked";
      return `${who} a ${fmtUsd(f.amount)} payment to ${f.vendor} for ${f.endpoint} (pay-to ${short(f.payTo)}).${f.note ? ` Note: "${f.note}"` : ""}`;
    }
    case "rule": {
      const r = f.rule;
      const scope = "vendor" in r && r.vendor ? ` for ${r.vendor}` : "";
      const s =
        r.type === "auto_ok_under" ? `auto-approve payments under ${fmtUsd(r.amount)}${scope}`
        : r.type === "always_ask_above" ? `always ask before paying more than ${fmtUsd(r.amount)}${scope}`
        : r.type === "never_pay" ? `never pay ${r.vendor}`
        : `keep total spending under ${fmtUsd(r.amount)} per day`;
      return `Spending rule set by the user: ${s}. (They said: "${f.source}")`;
    }
    case "payee":
      return `${f.label} (${f.vendor}) is paid at address ${f.payTo}.`;
    case "note":
      return `User note about spending: ${f.text}`;
  }
}

export const encodeFact = (f: Fact) => `${TAG} ${describe(f)}${SEP}${JSON.stringify(f)}`;

export function decodeFact(text: string): Fact | null {
  if (!text.startsWith(TAG)) return null;
  const i = text.indexOf(SEP);
  if (i < 0) return null;
  try {
    return JSON.parse(text.slice(i + SEP.length)) as Fact;
  } catch {
    return null;
  }
}
