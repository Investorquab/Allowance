import { afterEach, describe, expect, it, vi } from "vitest";
import { requirementFor, VENDORS } from "../src/lib/vendors";
import { servePriceWire } from "../src/lib/vendor-server";

describe("PriceWire — a real external API guarded behind our Sui-settled 402", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is a normal (non-attack) vendor with a valid 402 offer", () => {
    expect(VENDORS.pricewire).toBeTruthy();
    expect(Object.keys(VENDORS.pricewire.endpoints)).toEqual(expect.arrayContaining(["spot", "fx"]));
    const url = new URL("http://localhost/api/vendors/pricewire/spot?token=sui");
    const req = requirementFor(url, "pricewire", "spot", "nonce-1");
    expect(req?.scheme).toBe("exact");
    expect(req?.amount).toBe("10000"); // $0.01 in USDC base units
    expect(req?.vendor).toBe("pricewire");
    expect(req?.demoAttack).toBeUndefined(); // never a demo-attack, so it can pay in live
  });

  it("sim mode is deterministic and never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const url = new URL("http://localhost/api/vendors/pricewire/spot?token=sui");
    const a = (await servePriceWire("spot", url, false)) as { source: string; usd: number };
    const b = (await servePriceWire("spot", url, false)) as { usd: number };
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(a.source).toBe("simulated");
    expect(a.usd).toBe(b.usd); // deterministic for the same token
  });

  it("live mode calls the real upstream and maps its response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sui: { usd: 3.21, usd_24h_change: -1.5 } }), { status: 200 }),
    );
    const url = new URL("http://localhost/api/vendors/pricewire/spot?token=sui");
    const r = (await servePriceWire("spot", url, true)) as { usd: number; change24h: number; source: string };
    expect(r.usd).toBe(3.21);
    expect(r.change24h).toBe(-1.5);
    expect(r.source).toContain("CoinGecko");
  });
});
