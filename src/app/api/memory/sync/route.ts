import { requireAuth } from "@/lib/auth";
import { services } from "@/lib/services";
import { WalrusMemory } from "@/lib/memory/store";

/** Rebuild the local mirror from Walrus — proves memory is owned on Walrus, not this server's disk. */
export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { memory } = services();
  if (!(memory instanceof WalrusMemory) || !memory.rebuild) {
    return Response.json({ error: "Sync is only available in live (Walrus) mode." }, { status: 400 });
  }
  try {
    return Response.json(await memory.rebuild());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
