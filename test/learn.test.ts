import { describe, expect, it } from "vitest";
import { parseRules } from "../src/lib/guard/learn";
import { decodeFact, encodeFact } from "../src/lib/memory/facts";
import { decodePayment, encodePayment } from "../src/lib/x402";

describe("parseRules — turning the user's words into rules", () => {
  it("auto-approve under, scoped to the vendor", () => {
    expect(parseRules("Chainlens is fine — auto-approve under 5 cents from them", "chainlens")).toEqual([
      { type: "auto_ok_under", amount: "50000", vendor: "chainlens" },
    ]);
  });
  it("ask above, global", () => {
    expect(parseRules("ask me above $0.20", "x")).toEqual([{ type: "always_ask_above", amount: "200000" }]);
  });
  it("never pay", () => {
    expect(parseRules("scam, never pay these guys again", "datapu1se")).toEqual([{ type: "never_pay", vendor: "datapu1se" }]);
  });
  it("daily budget", () => {
    expect(parseRules("keep it under $2 a day", "x")).toEqual([{ type: "daily_budget", amount: "2000000" }]);
  });
  it("plain notes create no rule", () => {
    expect(parseRules("one-off, worth it", "x")).toEqual([]);
  });
});

describe("encoding", () => {
  it("facts round-trip through the Walrus text format", () => {
    const f = { kind: "payee" as const, vendor: "chainlens", payTo: "0xabc", label: "Chainlens", at: "2026-11-06T00:00:00Z" };
    const text = encodeFact(f);
    expect(text).toContain("Chainlens (chainlens) is paid at address 0xabc");
    expect(decodeFact(text)).toEqual(f);
  });
  it("X-PAYMENT header round-trips", () => {
    const p = { x402Version: 1, scheme: "exact" as const, network: "sui:mainnet", payload: { digest: "D", payer: "0x1", nonce: "n" } };
    expect(decodePayment(encodePayment(p))).toEqual(p);
    expect(decodePayment("garbage")).toBeNull();
  });
});
