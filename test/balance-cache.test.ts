import { describe, expect, it } from "vitest";
import { getCachedBalance, invalidateBalanceCache, setCachedBalance } from "../src/lib/balance-cache";

describe("balance cache (A3)", () => {
  it("serves a set value, scopes by key, and clears on invalidation", () => {
    invalidateBalanceCache();
    expect(getCachedBalance("agent|usdc")).toBeNull();

    setCachedBalance("agent|usdc", "1230000");
    expect(getCachedBalance("agent|usdc")).toBe("1230000");
    expect(getCachedBalance("other|usdc")).toBeNull(); // different key → miss

    invalidateBalanceCache();
    expect(getCachedBalance("agent|usdc")).toBeNull();
  });
});
