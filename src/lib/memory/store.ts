import { MemWal } from "@mysten-incubation/memwal";
import { db, newId, save } from "../store";
import type { Fact, StoredFact } from "../types";
import { normalizeNoteText } from "../guard/learn";
import { decodeFact, describe, encodeFact } from "./facts";

export interface MemoryStore {
  readonly name: string;
  /**
   * Write a fact to memory. `wait` defaults to true (block until the Walrus blob id is known, so the
   * fact is immediately recallable) — required for rules, payees and human decisions. Pass
   * `{ wait: false }` for low-stakes logs (allowance's own auto-pay/blocked records) so a payment
   * isn't held up by the write; the blob id is backfilled by the next sync/rebuild (A7).
   */
  remember(fact: Fact, opts?: { wait?: boolean }): Promise<StoredFact>;
  /** `sort: "recent"` makes newest facts win (used for rules, so an updated limit beats an old one). */
  recall(query: string, limit?: number, opts?: { sort?: "recent" | "relevance"; maxDistance?: number }): Promise<StoredFact[]>;
  /**
   * Turn a free-text note into candidate statements that `parseRules` can read. Live mode sends the
   * note to Walrus `analyze()` (server-side fact extraction, stored on Walrus in the background);
   * sim mode normalizes it offline. Always includes a normalized copy so rules work either way.
   */
  analyze(note: string): Promise<string[]>;
  /** Local mirror of everything written (fast UI listing). */
  all(): StoredFact[];
  /** Repopulate the local mirror from the source of truth; returns the authoritative count. */
  rebuild?(): Promise<{ onWalrus: number; mirrored: number }>;
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
  async analyze(note: string) {
    // Offline: split into clauses and normalize each, so word-amounts across a sentence are caught.
    const clauses = note.split(/[;.]|,?\s+(?:but|and|also|however)\s+/i).map((s) => s.trim()).filter(Boolean);
    const out = new Set<string>([normalizeNoteText(note)]);
    for (const c of clauses) out.add(normalizeNoteText(c));
    return [...out];
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
  private namespace: string;
  lastError?: string;

  constructor(opts: { key: string; accountId: string; serverUrl?: string; namespace: string }) {
    this.namespace = opts.namespace;
    this.mw = MemWal.create({ key: opts.key, accountId: opts.accountId, serverUrl: opts.serverUrl, namespace: opts.namespace });
  }

  /**
   * "Your memory on Walrus." Lists every memory this account holds in our namespace (authoritative
   * count), then pulls their content back via recall and merges anything missing into the local
   * mirror. Proves the memory is portable and owned on Walrus, not trapped in this server's files.
   */
  async rebuild() {
    const blobIds = new Set<string>();
    let cursor: string | undefined;
    for (let i = 0; i < 25; i++) {
      const page = await this.mw.listMemories({ cursor, namespace: this.namespace, limit: 500 });
      for (const m of page.memories) blobIds.add(m.blob_id);
      cursor = page.next_cursor ?? undefined;
      if (!page.has_more) break;
    }
    const onWalrus = blobIds.size;

    const existing = new Set(db().facts.map((f) => f.blobId).filter(Boolean) as string[]);
    const queries = [
      "payment decision approved auto-paid denied blocked",
      "spending rule limit auto-approve daily budget never pay",
      "vendor payee is paid at address",
      "chainlens datapulse allowance payment",
    ];
    let mirrored = 0;
    for (const q of queries) {
      try {
        const r = await this.mw.recall({ query: q, limit: 500 });
        for (const hit of r.results) {
          if (existing.has(hit.blob_id)) continue;
          const fact = decodeFact(hit.text);
          if (!fact) continue;
          existing.add(hit.blob_id);
          mirror(fact, hit.blob_id);
          mirrored++;
        }
      } catch { /* skip a failed query, keep going */ }
    }
    return { onWalrus, mirrored };
  }

  async health() {
    return this.mw.health();
  }

  async remember(fact: Fact, opts?: { wait?: boolean }) {
    if (opts?.wait === false) {
      // Fire-and-forget: don't block a payment on the write. The accepted result has no blob id yet
      // (it's assigned after indexing), so mirror without one; the next sync/rebuild backfills it (A7).
      await this.mw.remember(encodeFact(fact));
      return mirror(fact);
    }
    const r = await this.mw.rememberAndWait(encodeFact(fact));
    return mirror(fact, r.blob_id);
  }

  /**
   * Send the raw note to Walrus `analyze()`: the relayer extracts clean fact statements, embeds and
   * stores them on Walrus in the background (so the note itself becomes owned memory), and returns
   * their text. We parse rules from those AND from a locally-normalized copy, so rules are reliable
   * even if the extractor phrases things our regex doesn't recognise. Degrades to the offline path.
   */
  async analyze(note: string) {
    const texts = new Set<string>([normalizeNoteText(note)]);
    try {
      const r = await this.mw.analyze(note, { namespace: this.namespace });
      for (const f of r.facts) if (f.text) texts.add(f.text);
      this.lastError = undefined;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
    return [...texts];
  }

  async recall(query: string, limit = 20, opts?: { sort?: "recent" | "relevance"; maxDistance?: number }) {
    try {
      const r = await this.mw.recall({ query, limit, ...(opts?.sort ? { sort: opts.sort } : {}), ...(opts?.maxDistance ? { maxDistance: opts.maxDistance } : {}) });
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
