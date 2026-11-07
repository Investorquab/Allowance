import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-a6-"));
process.env.ALLOWANCE_MODE = "sim";
process.env.ALLOWANCE_DATA_DIR = dir;

// Imported after env is set.
const { handleVendor } = await import("../src/lib/vendor-server");
const { services, resetServices } = await import("../src/lib/services");
const { db, resetDb } = await import("../src/lib/store");
const { encodePayment, parsePaymentRequired } = await import("../src/lib/x402");
const { getConfig } = await import("../src/lib/config");

const URL_STR = `http://localhost:3000/api/vendors/chainlens/wallet-report?address=0x${"a".repeat(64)}`;

/** Fetch a fresh 402 offer and return the parsed requirement (nonce, payTo, amount, asset). */
async function offer() {
  const res = await handleVendor(new Request(URL_STR), "chainlens", "wallet-report");
  expect(res.status).toBe(402);
  return parsePaymentRequired(await res.json())!;
}

/** Make a real sim payment of `amount` to `to`, returning the on-chain digest. */
async function paySim(to: string, coinType: string, amount: string) {
  const { chain } = services();
  const prepared = await chain.preparePayment(to, coinType, amount);
  return chain.executePayment(prepared);
}

const header = (digest: string, payer: string, nonce: string, network = getConfig().network) =>
  encodePayment({ x402Version: 1, scheme: "exact", network, payload: { digest, payer, nonce } });

const retry = (h: string) =>
  handleVendor(new Request(URL_STR, { headers: { "x-payment": h } }), "chainlens", "wallet-report");

describe("vendor verification (A6)", () => {
  beforeEach(() => {
    resetDb();
    resetServices();
    services(); // funds the sim agent wallet
  });

  it("serves the data for a correct, exact, fresh payment", async () => {
    const req = await offer();
    const digest = await paySim(req.payTo, req.asset, req.amount);
    const res = await retry(header(digest, services().chain.agentAddress(), req.nonce));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toBeTruthy();
  });

  it("rejects a payment whose header payer is not the real sender", async () => {
    const req = await offer();
    const digest = await paySim(req.payTo, req.asset, req.amount);
    const res = await retry(header(digest, "0x" + "b".repeat(64), req.nonce)); // lies about the payer
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/payer does not match/i);
  });

  it("rejects overpayment (exact scheme)", async () => {
    const req = await offer();
    const over = (BigInt(req.amount) * 2n).toString();
    const digest = await paySim(req.payTo, req.asset, over);
    const res = await retry(header(digest, services().chain.agentAddress(), req.nonce));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/amount mismatch/i);
  });

  it("rejects a payment against an expired 402 offer", async () => {
    const req = await offer();
    // Backdate the stored offer to 11 minutes ago.
    db().nonces[req.nonce].issuedAt = new Date(Date.now() - 11 * 60_000).toISOString();
    const digest = await paySim(req.payTo, req.asset, req.amount);
    const res = await retry(header(digest, services().chain.agentAddress(), req.nonce));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/expired/i);
  });
});
