/**
 * Hour-1 check for live mode. Run:  npm run check:live
 * Verifies Tatum Sui RPC, the agent wallet, and a Walrus Memory write + recall on mainnet.
 */
import { getConfig, fmtUsd } from "../src/lib/config";
import { TatumSuiChain } from "../src/lib/chain/tatum";
import { MemWal } from "@mysten-incubation/memwal";

const ok = (m: string) => console.log(`  ✅ ${m}`);
const bad = (m: string) => { console.log(`  ❌ ${m}`); process.exitCode = 1; };

async function main() {
  const c = getConfig();
  console.log("\nTatum Sui RPC");
  if (!c.tatumApiKey) bad("TATUM_API_KEY missing");
  else {
    const chain = new TatumSuiChain({ url: c.suiRpcUrl, apiKey: c.tatumApiKey, agentPrivateKey: c.agentPrivateKey || undefined });
    try { ok(`reference gas price: ${await chain.rpc.call("suix_getReferenceGasPrice", [])}`); } catch (e) { bad(String(e)); }
    if (!c.agentPrivateKey) bad("AGENT_SUI_PRIVATE_KEY missing");
    else {
      const a = chain.agentAddress();
      ok(`agent wallet ${a}`);
      try {
        const sui = await chain.getBalance(a, "0x2::sui::SUI");
        const usdc = await chain.getBalance(a, c.usdcCoinType);
        (BigInt(sui) > 50_000_000n ? ok : bad)(`SUI for gas: ${Number(sui) / 1e9}`);
        (BigInt(usdc) >= 500_000n ? ok : bad)(`USDC: ${fmtUsd(usdc)} (coin type ${c.usdcCoinType.slice(0, 12)}…)`);
      } catch (e) { bad(String(e)); }
    }
    (c.vendorAddress ? ok : bad)(`vendor address ${c.vendorAddress || "missing (VENDOR_SUI_ADDRESS)"}`);
  }

  console.log("\nWalrus Memory (mainnet)");
  if (!c.memwalKey || !c.memwalAccountId) bad("MEMWAL_PRIVATE_KEY / MEMWAL_ACCOUNT_ID missing");
  else {
    try {
      const mw = MemWal.create({ key: c.memwalKey, accountId: c.memwalAccountId, serverUrl: c.memwalServerUrl, namespace: `${c.memwalNamespace}-check` });
      ok(`health: ${JSON.stringify(await mw.health())}`);
      const w = await mw.rememberAndWait(`Allowance setup check at ${new Date().toISOString()}`);
      ok(`wrote memory → blob ${w.blob_id}`);
      const r = await mw.recall({ query: "Allowance setup check", limit: 3 });
      (r.results.length ? ok : bad)(`recall returned ${r.results.length} result(s)`);
    } catch (e) { bad(String(e)); }
  }
  console.log(process.exitCode ? "\nFix the ❌ items, then set ALLOWANCE_MODE=live.\n" : "\nAll good — set ALLOWANCE_MODE=live and run `npm run dev`.\n");
}
main();
