import { describe, expect, it } from "vitest";
import { normalizeNoteText, parseRules } from "../src/lib/guard/learn";
import { LocalMemory } from "../src/lib/memory/store";

describe("analyze() turns loose free-text notes into rules", () => {
  it("recovers a word-amount daily budget the raw parser misses", () => {
    const note = "please keep it under two dollars a day";
    // The deterministic parser alone can't see "two dollars" (no digits) as an amount.
    expect(parseRules(note, "chainlens").some((r) => r.type === "daily_budget")).toBe(false);
    // After normalization ("two dollars" → "$2") it parses cleanly.
    const rules = parseRules(normalizeNoteText(note), "chainlens");
    const daily = rules.find((r) => r.type === "daily_budget");
    expect(daily && "amount" in daily ? daily.amount : undefined).toBe("2000000");
  });

  it("normalizes 'a buck', 'bucks' and 'half a dollar'", () => {
    expect(normalizeNoteText("auto-approve under half a dollar from them")).toContain("$0.50");
    expect(normalizeNoteText("no more than 3 bucks a day")).toContain("$3");
    expect(normalizeNoteText("ask me above a buck")).toContain("$1");
  });

  it("LocalMemory.analyze splits a multi-clause note so each rule is caught", async () => {
    const mem = new LocalMemory();
    const note = "auto-approve under five cents from them, but always ask above twenty cents, and never pay weird ones";
    const texts = await mem.analyze(note);
    const rules = texts.flatMap((t) => parseRules(t, "chainlens"));
    expect(rules.some((r) => r.type === "auto_ok_under")).toBe(true);
    expect(rules.some((r) => r.type === "always_ask_above")).toBe(true);
    expect(rules.some((r) => r.type === "never_pay")).toBe(true);
  });

  it("does not raise an amount it cannot find (silence is honest)", () => {
    expect(parseRules(normalizeNoteText("thanks, go ahead this once"), "chainlens")).toEqual([]);
  });
});
