import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-jobs-test-"));
process.env.ALLOWANCE_MODE = "sim";
process.env.ALLOWANCE_DATA_DIR = dir;

// Imported after env is set.
const { simulateWeek } = await import("../src/lib/demo");
const { db } = await import("../src/lib/store");
const { dashboardState } = await import("../src/lib/stats");

describe("per-job spend breakdown", () => {
  beforeAll(async () => {
    await simulateWeek();
  });

  it("groups each agent run into a job with its own steps", async () => {
    const s = await dashboardState();
    expect(s.jobs.length).toBe(7); // one job per demo day
    for (const j of s.jobs) {
      expect(j.stepCount).toBeGreaterThan(0);
      expect(j.steps.length).toBe(j.stepCount);
      expect(j.label).toMatch(/Day \d agent run/);
    }
  });

  it("a job's total equals the sum of its paid steps", async () => {
    const s = await dashboardState();
    for (const j of s.jobs) {
      const sum = j.steps
        .filter((st: { final: string }) => st.final === "paid")
        .reduce((acc: bigint, st: { amount: string }) => acc + BigInt(st.amount), 0n);
      expect(j.spent).toBe(sum.toString());
      expect(j.paid).toBe(j.steps.filter((st: { final: string }) => st.final === "paid").length);
    }
  });

  it("flags the costliest paid step as the one that ran up the bill, and lists steps costliest-first", async () => {
    const s = await dashboardState();
    for (const j of s.jobs) {
      const paid = j.steps.filter((st: { final: string }) => st.final === "paid");
      if (!paid.length) {
        expect(j.topStepRequestId).toBeNull();
        continue;
      }
      const maxAmount = paid.reduce((m: bigint, st: { amount: string }) => (BigInt(st.amount) > m ? BigInt(st.amount) : m), 0n);
      const top = j.steps.find((st: { requestId: string }) => st.requestId === j.topStepRequestId)!;
      expect(top).toBeTruthy();
      expect(BigInt(top.amount)).toBe(maxAmount);
      // steps are sorted costliest-first
      const amounts = j.steps.map((st: { amount: string }) => BigInt(st.amount));
      for (let i = 1; i < amounts.length; i++) expect(amounts[i] <= amounts[i - 1]).toBe(true);
    }
  });

  it("the deep-dive day's run is led by the deep-dive step", async () => {
    const s = await dashboardState();
    // Day 5 adds the $0.40 "Long research report on DEEP" — far pricier than the routine calls.
    const day5 = s.jobs.find((j: { day: number }) => j.day === 5)!;
    expect(day5).toBeTruthy();
    const top = day5.steps.find((st: { requestId: string }) => st.requestId === day5.topStepRequestId)!;
    expect(top.endpoint).toBe("deep-dive");
  });

  it("activity items carry their job id and label", () => {
    const tagged = db().activity.filter((a) => a.jobId);
    expect(tagged.length).toBe(db().activity.length); // every demo call belongs to a day's job
    expect(tagged.every((a) => a.jobLabel?.startsWith("Day "))).toBe(true);
  });
});
