import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-test-"));
process.env.ALLOWANCE_MODE = "sim";
process.env.ALLOWANCE_DATA_DIR = dir;

// Imported after env is set.
const { simulateWeek } = await import("../src/lib/demo");
const { db } = await import("../src/lib/store");
const { dashboardState, morningBrief } = await import("../src/lib/stats");
const { handleVendor } = await import("../src/lib/vendor-server");
const { encodePayment } = await import("../src/lib/x402");

describe("a simulated week (sim mode, end to end)", () => {
  let week: Awaited<ReturnType<typeof simulateWeek>>;
  beforeAll(async () => {
    week = await simulateWeek();
  });

  it("asks less as it learns", async () => {
    const s = await dashboardState();
    const asked = s.series.map((r) => r.asked);
    console.log("asks per day:", asked.join(" "), "| auto:", s.series.map((r) => r.auto).join(" "), "| blocked:", s.series.map((r) => r.blocked).join(" "));
    expect(asked[0]).toBeGreaterThanOrEqual(3);
    expect(asked.at(-1)).toBe(0);
    expect(asked.slice(-3).reduce((a, b) => a + b, 0)).toBeLessThan(asked[0]);
  });

  it("blocks the duplicate, the look-alike scam and the redirected invoice", () => {
    const blockedCodes = Object.values(db().decisions).filter((d) => d.action === "block").flatMap((d) => d.checks.filter((c) => c.level === "block").map((c) => c.code));
    expect(blockedCodes).toEqual(expect.arrayContaining(["DUPLICATE", "LOOKALIKE_PAYEE", "PAYEE_CHANGED"]));
  });

  it("every paid request was verified by the vendor and served data", () => {
    const paid = db().activity.filter((a) => a.final === "paid");
    expect(paid.length).toBeGreaterThan(15);
    for (const a of paid) {
      expect(db().payments.find((p) => p.requestId === a.requestId)?.verifiedByVendor).toBe(true);
      expect(a.result).toBeTruthy();
      expect((a.result as any).error).toBeUndefined();
    }
  });

  it("learned rules from the human's words and wrote 10+ memories", () => {
    const facts = db().facts;
    expect(facts.length).toBeGreaterThanOrEqual(10);
    expect(facts.some((f) => f.fact.kind === "rule" && f.fact.rule.type === "auto_ok_under")).toBe(true);
  });

  it("vendor refuses a reused payment (replay protection)", async () => {
    const p = db().payments[0];
    const act = db().activity.find((a) => a.requestId === p.requestId)!;
    const nonce = db().requests[p.requestId].requirement.nonce;
    const header = encodePayment({ x402Version: 1, scheme: "exact", network: "sui:sim", payload: { digest: p.digest, payer: "x", nonce } });
    const u = new URL(act.url!);
    const res = await handleVendor(new Request(act.url!, { headers: { "x-payment": header } }), u.pathname.split("/")[3], u.pathname.split("/")[4]);
    expect(res.status).toBe(402);
  });

  it("morning brief summarises the last day", () => {
    const b = morningBrief();
    expect(b.day).toBe(7);
    expect(b.lines.join(" ")).toContain("Rules I'm following");
  });
});
