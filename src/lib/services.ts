import { assertLive, getConfig, toUnits } from "./config";
import type { ChainAdapter } from "./chain/adapter";
import { SimChain, simAddress } from "./chain/sim";
import { TatumSuiChain } from "./chain/tatum";
import { LocalMemory, WalrusMemory, type MemoryStore } from "./memory/store";
import { db } from "./store";

const g = globalThis as unknown as { __allowanceSvc?: { key: string; chain: ChainAdapter; memory: MemoryStore } };

/** Picks live (Tatum + Walrus, mainnet) or sim (offline) adapters from env. */
export function services() {
  const c = getConfig();
  const key = `${c.mode}|${c.dataDir}`;
  if (g.__allowanceSvc?.key === key) return { config: c, ...g.__allowanceSvc };

  let chain: ChainAdapter;
  let memory: MemoryStore;
  if (c.mode === "live") {
    assertLive(c);
    chain = new TatumSuiChain({ url: c.suiRpcUrl, apiKey: c.tatumApiKey!, agentPrivateKey: c.agentPrivateKey });
    memory = new WalrusMemory({ key: c.memwalKey!, accountId: c.memwalAccountId!, serverUrl: c.memwalServerUrl, namespace: c.memwalNamespace! });
  } else {
    const sim = new SimChain(simAddress("agent"));
    if (!db().sim.balances[sim.agentAddress()]) {
      sim.fund(sim.agentAddress(), c.usdcCoinType, toUnits(3)); // $3 of play money
      sim.fund(simAddress("vendor:chainlens"), c.usdcCoinType, toUnits(0)); // give vendors "history"
    }
    chain = sim;
    memory = new LocalMemory();
  }
  g.__allowanceSvc = { key, chain, memory };
  return { config: c, chain, memory };
}

/** For tests / demo reset. */
export function resetServices() {
  g.__allowanceSvc = undefined;
}
