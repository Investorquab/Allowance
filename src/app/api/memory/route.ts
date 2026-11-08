import { requireAuth } from "@/lib/auth";
import { parseRules } from "@/lib/guard/learn";
import { services } from "@/lib/services";

/** Tell Allowance a rule in plain words: { text: "never pay datapu1se", vendor?: "datapu1se" } */
export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { text, vendor } = (await request.json().catch(() => ({}))) as { text?: string; vendor?: string };
  if (!text?.trim()) return Response.json({ error: "text required" }, { status: 400 });
  const { memory } = services();
  const at = new Date().toISOString();
  // Parse the raw words, then widen with analyze() (Walrus extractor live / normalizer in sim) so
  // loosely-phrased rules ("no more than two bucks a day") are still caught. Dedupe by rule shape.
  const candidates = [text, ...(await memory.analyze(text).catch(() => []))];
  const seen = new Set<string>();
  const written = [];
  for (const t of candidates) {
    for (const rule of parseRules(t, vendor || "")) {
      if (rule.type === "never_pay" && !rule.vendor) continue;
      const k = JSON.stringify(rule);
      if (seen.has(k)) continue;
      seen.add(k);
      written.push(await memory.remember({ kind: "rule", rule, source: text, at }));
    }
  }
  if (!written.length) written.push(await memory.remember({ kind: "note", text, at }));
  return Response.json({ written });
}
