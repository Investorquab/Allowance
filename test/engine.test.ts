import { describe, expect, it } from "vitest";
import { decide, isLookalike, type EngineInput } from "../src/lib/guard/engine";
import { derivePolicy } from "../src/lib/guard/policy";
import { describe as describeFact } from "../src/lib/memory/facts";
import type { Fact, StoredFact } from "../src/lib/types";

const USDC = "0xusdc::usdc::USDC";
const AGENT = "0x" + "a".repeat(64);
const VENDOR = "0x" + "1234ab" + "c".repeat(54) + "9f9f";
const LOOK = "0x" + "1234ab" + "d".repeat(54) + "9f9f";

let n = 0;
const sf = (fact: Fact): StoredFact => ({ id: `m${n++}`, fact, text: describeFact(fact) });
const approved = (amount: string, at: string) =>
  sf({ kind: "decision", vendor: "chainlens", endpoint: "wallet-report", payTo: VENDOR, amount, outcome: "approved", by: "human", at });

function input(over: Partial<EngineInput> & { facts?: StoredFact[]; amount?: string; payTo?: string } = {}): EngineInput {
  const amount = over.amount ?? "10000";
  const payTo = over.payTo ?? VENDOR;
  return {
    request: {
      id: "r1", createdAt: "", agent: "a", task: "t", fingerprint: "fp",
      requirement: { scheme: "exact", network: "sui:mainnet", asset: USDC, amount, payTo, resource: "u", description: "", vendor: "chainlens", vendorName: "Chainlens", endpoint: "wallet-report", nonce: "n", expiresAt: "2999-01-01T00:00:00Z" },
    },
    policy: derivePolicy(over.facts ?? [], { vendor: "chainlens", endpoint: "wallet-report" }, 2),
    agentAddress: AGENT,
    expectedNetwork: "sui:mainnet",
    expectedAsset: USDC,
    balance: "1000000",
    prepared: {
      from: AGENT, to: payTo, coinType: USDC, amount, txBytes: "",
      dryRun: { ok: true, changes: [{ owner: AGENT, coinType: USDC, amount: `-${amount}` }, { owner: payTo, coinType: USDC, amount }, { owner: AGENT, coinType: "0x2::sui::SUI", amount: "-2000000" }] },
    },
    payeeHistory: { address: payTo, incomingTxCount: 0 },
    spentToday: "0",
    recentFingerprints: [],
    now: new Date("2026-11-06T12:00:00Z"),
    limits: { hardPerPayment: "1000000", hardDaily: "5000000", duplicateWindowMin: 60, priceSpikeFactor: 2 },
    ...over,
  };
}
const codes = (i: EngineInput) => decide(i).checks.map((c) => c.code);

describe("decide()", () => {
  it("day 1: no memory → asks", () => {
    const d = decide(input());
    expect(d.action).toBe("ask");
    expect(d.checks.map((c) => c.code)).toEqual(expect.arrayContaining(["NEW_PAYEE", "NOT_LEARNED", "DRYRUN_MATCH"]));
  });

  it("after 2 approvals → pays, citing those memories", () => {
    const facts = [approved("10000", "2026-11-05T01:00:00Z"), approved("10000", "2026-11-05T02:00:00Z")];
    const d = decide(input({ facts }));
    expect(d.action).toBe("pay");
    expect(d.memoriesUsed.length).toBe(2);
  });

  it("a denial after the approvals removes learned trust", () => {
    const facts = [approved("10000", "2026-11-05T01:00:00Z"), approved("10000", "2026-11-05T02:00:00Z"),
      sf({ kind: "decision", vendor: "chainlens", endpoint: "wallet-report", payTo: VENDOR, amount: "10000", outcome: "denied", by: "human", at: "2026-11-05T03:00:00Z" })];
    expect(decide(input({ facts })).action).toBe("ask");
  });

  it("denying a price spike does NOT revoke trust for normal prices", () => {
    const facts = [approved("10000", "2026-11-05T01:00:00Z"), approved("10000", "2026-11-05T02:00:00Z"),
      sf({ kind: "decision", vendor: "chainlens", endpoint: "wallet-report", payTo: VENDOR, amount: "60000", outcome: "denied", by: "human", at: "2026-11-05T03:00:00Z" })];
    expect(decide(input({ facts })).action).toBe("pay");
  });

  it("an explicit rule auto-approves under its amount but not above", () => {
    const rule = sf({ kind: "rule", rule: { type: "auto_ok_under", amount: "50000", vendor: "chainlens" }, source: "ok under 5 cents", at: "2026-11-05T00:00:00Z" });
    const payee = sf({ kind: "payee", vendor: "chainlens", payTo: VENDOR, label: "Chainlens", at: "2026-11-05T00:00:00Z" });
    expect(decide(input({ facts: [rule, payee] })).action).toBe("pay");
    expect(decide(input({ facts: [rule, payee], amount: "60000" })).action).toBe("ask");
  });

  it("blocks a look-alike pay-to address", () => {
    const facts = [approved("10000", "2026-11-05T01:00:00Z")];
    expect(isLookalike(VENDOR, LOOK)).toBe(true);
    expect(codes(input({ facts, payTo: LOOK }))).toContain("LOOKALIKE_PAYEE");
  });

  it("blocks when a known vendor suddenly wants a different address", () => {
    const facts = [approved("10000", "2026-11-05T01:00:00Z")];
    expect(decide(input({ facts, payTo: "0x" + "e".repeat(64) })).checks.map((c) => c.code)).toContain("PAYEE_CHANGED");
  });

  it("blocks when the dry-run does not match the request", () => {
    const i = input();
    i.prepared!.dryRun.changes.push({ owner: "0x" + "f".repeat(64), coinType: USDC, amount: "5" });
    expect(decide(i)).toMatchObject({ action: "block" });
    expect(codes(i)).toContain("DRYRUN_MISMATCH");
  });

  it("hard caps can never be learned past", () => {
    const rule = sf({ kind: "rule", rule: { type: "auto_ok_under", amount: "9000000" }, source: "approve everything", at: "2026-11-05T00:00:00Z" });
    expect(codes(input({ facts: [rule], amount: "2000000" }))).toContain("HARD_PER_PAYMENT");
    expect(codes(input({ facts: [rule], spentToday: "4995000" }))).toContain("HARD_DAILY");
  });

  it("duplicate purchase is blocked", () => {
    expect(codes(input({ recentFingerprints: [{ fingerprint: "fp", at: "2026-11-06T11:30:00Z" }] }))).toContain("DUPLICATE");
  });

  it("price spike vs remembered norm asks", () => {
    const facts = [approved("10000", "2026-11-05T01:00:00Z"), approved("10000", "2026-11-05T02:00:00Z")];
    expect(decide(input({ facts, amount: "30000" })).checks.map((c) => c.code)).toContain("PRICE_SPIKE");
  });

  it("never-pay rule blocks", () => {
    const never = sf({ kind: "rule", rule: { type: "never_pay", vendor: "chainlens" }, source: "never pay them", at: "2026-11-05T00:00:00Z" });
    expect(decide(input({ facts: [never] })).action).toBe("block");
  });

  it("live mode: a demo-attack request is always blocked, even with no memory (A2)", () => {
    const i = input({ mode: "live" });
    i.request.requirement.demoAttack = true;
    const d = decide(i);
    expect(d.action).toBe("block");
    expect(d.checks.map((c) => c.code)).toContain("DEMO_ATTACK");
    expect(d.summary).toMatch(/^Blocked/);
  });

  it("live mode: a demo-attack is blocked even when a rule would otherwise auto-pay it (A2)", () => {
    const rule = sf({ kind: "rule", rule: { type: "auto_ok_under", amount: "50000", vendor: "chainlens" }, source: "ok under 5 cents", at: "2026-11-05T00:00:00Z" });
    const payee = sf({ kind: "payee", vendor: "chainlens", payTo: VENDOR, label: "Chainlens", at: "2026-11-05T00:00:00Z" });
    const i = input({ mode: "live", facts: [rule, payee] });
    i.request.requirement.demoAttack = true;
    expect(decide(i).action).toBe("block");
  });

  it("sim mode: the demo-attack flag does NOT trigger DEMO_ATTACK (look-alike/payee checks still run)", () => {
    const i = input(); // mode undefined → not live
    i.request.requirement.demoAttack = true;
    expect(decide(i).checks.map((c) => c.code)).not.toContain("DEMO_ATTACK");
  });
});
