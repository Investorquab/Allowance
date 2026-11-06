import { parseRules } from "@/lib/guard/learn";
import { services } from "@/lib/services";

/** Tell Allowance a rule in plain words: { text: "never pay datapu1se", vendor?: "datapu1se" } */
export async function POST(request: Request) {
  const { text, vendor } = (await request.json().catch(() => ({}))) as { text?: string; vendor?: string };
  if (!text?.trim()) return Response.json({ error: "text required" }, { status: 400 });
  const { memory } = services();
  const at = new Date().toISOString();
  const rules = parseRules(text, vendor || "");
  const written = [];
  for (const rule of rules) {
    if (rule.type === "never_pay" && !rule.vendor) continue;
    written.push(await memory.remember({ kind: "rule", rule, source: text, at }));
  }
  if (!written.length) written.push(await memory.remember({ kind: "note", text, at }));
  return Response.json({ written });
}
