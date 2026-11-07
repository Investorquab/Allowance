import { fetchPaid } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { resolve } from "@/lib/guard";

/** Human answers an ask: { outcome: "approved" | "denied", note?: string } */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { outcome?: string; note?: string } | null;
  if (body?.outcome !== "approved" && body?.outcome !== "denied") return Response.json({ error: "outcome must be approved or denied" }, { status: 400 });
  try {
    const r = await resolve(id, body.outcome, body.note?.slice(0, 500));
    const data = "digest" in r && r.digest ? await fetchPaid(id, r.digest) : undefined;
    return Response.json({ ...r, data });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
