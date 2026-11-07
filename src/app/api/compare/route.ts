import { getConfig } from "@/lib/config";
import { compareMemory } from "@/lib/guard";
import { requirementFor } from "@/lib/vendors";

/**
 * Memory switch: decide a payment with vs without Walrus memory, side by side.
 * Read-only (no payment, no state change), so no admin auth needed.
 * Body: { path: "/api/vendors/<vendor>/<endpoint>?…", task?: string }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { path?: string; task?: string } | null;
  const path = body?.path ?? "";
  const m = path.match(/^\/api\/vendors\/([^/?]+)\/([^/?]+)/);
  if (!m) return Response.json({ error: "path must be a vendor path" }, { status: 400 });

  const url = new URL(path, getConfig().baseUrl);
  const requirement = requirementFor(url, m[1], m[2], "preview-nonce");
  if (!requirement) return Response.json({ error: "unknown vendor or endpoint" }, { status: 404 });

  try {
    return Response.json(await compareMemory(requirement, body?.task || "Memory switch"));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
