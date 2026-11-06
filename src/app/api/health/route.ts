import { connection } from "next/server";
import { getConfig } from "@/lib/config";
import { services } from "@/lib/services";
import { TatumSuiChain } from "@/lib/chain/tatum";
import { WalrusMemory } from "@/lib/memory/store";

export async function GET() {
  await connection();
  const c = getConfig();
  const out: Record<string, unknown> = { mode: c.mode };
  try {
    const { chain, memory } = services();
    if (chain instanceof TatumSuiChain) out.tatum = await chain.rpc.call("suix_getReferenceGasPrice", []);
    if (memory instanceof WalrusMemory) out.walrus = await memory.health();
    out.agent = chain.agentAddress();
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = e instanceof Error ? e.message : String(e);
  }
  return Response.json(out);
}
