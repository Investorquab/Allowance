import { MemWal } from "@mysten-incubation/memwal";
import { db, newId, save } from "../store";
import type { Fact, StoredFact } from "../types";
import { decodeFact, describe, encodeFact } from "./facts";

export interface MemoryStore {
  readonly name: string;
  remember(fact: Fact): Promise<StoredFact>;
  recall(query: string, limit?: number): Promise<StoredFact[]>;
  /** Local mirror of everything written (fast UI listing). */
  all(): StoredFact[];
}

function mirror(fact: Fact, blobId?: string): StoredFact {
  const sf: StoredFact = { id: newId("mem"), blobId, fact, text: describe(fact) };
  db().facts.push(sf);
  save();
  return sf;
}

/** Offline memory: local file + keyword relevance. */
export class LocalMemory implements MemoryStore {
  readonly name = "Local memory (offline)";
  async remember(fact: Fact) {
    return mirror(fact);
  }
  async recall(query: string, limit = 20) {
    const q = new Set(query.toLowerCase().split(/[^a-z0-9.$]+/).filter((w) => w.length > 2));
    return db()
      .facts.map((f) => ({ f, score: f.text.toLowerCase().split(/[^a-z0-9.$]+/).filter((w) => q.has(w)).length + (f.fact.kind === "rule" ? 1 : 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.f);
  }
  all() {
    return db().facts;
  }
}

/**
 * Walrus Memory on mainnet. Every fact is written to Walrus (rememberAndWait → blob id),
 * and decisions are made from what `recall` returns — memory is the policy, not a log.
 */
export class WalrusMemory implements MemoryStore {
  readonly name = "Walrus Memory (mainnet)";
  private mw: ReturnType<typeof MemWal.create>;
  lastError?: string;

  constructor(opts: { key: string; accountId: string; serverUrl?: string; namespace: string }) {
    this.mw = MemWal.create({ key: opts.key, accountId: opts.accountId, serverUrl: opts.serverUrl, namespace: opts.namespace });
  }

  async health() {
    return this.mw.health();
  }

  async remember(fact: Fact) {
    const r = await this.mw.rememberAndWait(encodeFact(fact));
    return mirror(fact, r.blob_id);
  }

  async recall(query: string, limit = 20) {
    try {
      const r = await this.mw.recall({ query, limit });
      this.lastError = undefined;
      const out: StoredFact[] = [];
      for (const hit of r.results) {
        const fact = decodeFact(hit.text);
        if (!fact) continue;
        const local = db().facts.find((f) => f.blobId === hit.blob_id);
        out.push(local ?? { id: `walrus_${hit.blob_id}`, blobId: hit.blob_id, fact, text: describe(fact) });
      }
      return out;
    } catch (e) {
      // Degrade loudly: fall back to the local mirror and surface the error in the UI.
      this.lastError = e instanceof Error ? e.message : String(e);
      return new LocalMemory().recall(query, limit);
    }
  }

  all() {
    return db().facts;
  }
}
