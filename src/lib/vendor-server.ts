import crypto from "node:crypto";
import { services } from "./services";
import { db, save } from "./store";
import { TatumSuiChain } from "./chain/tatum";
import { requirementFor, VENDORS } from "./vendors";
import { decodePayment, encodePaymentResponse, paymentRequired } from "./x402";

/**
 * The paid API (seller side). Works for any HTTP client that speaks the 402 flow — not just our agent.
 * Payment is verified on Sui through Tatum (sui_getTransactionBlock) and each digest can be used once.
 */
export async function handleVendor(request: Request, vendorId: string, endpoint: string): Promise<Response> {
  const url = new URL(request.url);
  const { chain, config } = services();
  const d = db();

  const payment = decodePayment(request.headers.get("x-payment"));
  if (!payment) {
    const nonce = crypto.randomUUID();
    const req = requirementFor(url, vendorId, endpoint, nonce);
    if (!req) return Response.json({ error: "unknown vendor or endpoint" }, { status: 404 });
    d.nonces[nonce] = { requirementHash: url.toString(), issuedAt: new Date().toISOString() };
    save();
    return paymentRequired(req);
  }

  const req = requirementFor(url, vendorId, endpoint, payment.payload.nonce);
  if (!req) return Response.json({ error: "unknown vendor or endpoint" }, { status: 404 });
  const issued = d.nonces[payment.payload.nonce];
  if (!issued || issued.requirementHash !== url.toString()) return paymentRequired(req, "unknown or mismatched nonce");
  if (payment.network !== config.network) return paymentRequired(req, `wrong network ${payment.network}`);
  if (d.usedDigests.includes(payment.payload.digest)) return paymentRequired(req, "payment already used");

  const v = await chain.verifyPayment(payment.payload.digest, { payTo: req.payTo, coinType: req.asset, amount: req.amount });
  if (!v.ok) return paymentRequired(req, `payment not valid: ${v.reason}`);
  d.usedDigests.push(payment.payload.digest);
  delete d.nonces[payment.payload.nonce];
  const rec = d.payments.find((p) => p.digest === payment.payload.digest);
  if (rec) rec.verifiedByVendor = true;
  save();

  const data = await serve(vendorId, endpoint, url);
  return Response.json(
    { vendor: VENDORS[vendorId].name, endpoint, paid: req.amount, digest: v.digest, data },
    { headers: { "x-payment-response": encodePaymentResponse({ success: true, digest: v.digest, network: config.network }) } },
  );
}

async function serve(vendorId: string, endpoint: string, url: URL) {
  const { chain, config } = services();
  const address = url.searchParams.get("address") ?? "";
  const token = url.searchParams.get("token") ?? "SUI";
  const rpc = chain instanceof TatumSuiChain ? chain.rpc : null;

  if (vendorId === "chainlens") {
    if (endpoint === "portfolio" || endpoint === "wallet-report") {
      if (rpc && address) {
        const balances = await rpc.getAllBalances(address);
        const recent = endpoint === "wallet-report" ? await rpc.queryTxs({ FromAddress: address }, 10, true) : null;
        return { address, balances, recentTxs: recent?.data.map((t) => t.digest) ?? undefined, source: "Tatum Sui RPC (mainnet)" };
      }
      const seed = parseInt(crypto.createHash("md5").update(address).digest("hex").slice(0, 6), 16);
      return { address, balances: [{ coinType: "0x2::sui::SUI", totalBalance: String(seed * 1000) }, { coinType: config.usdcCoinType, totalBalance: String(seed % 90000) }], source: "simulated" };
    }
    if (endpoint === "payee-check") {
      const h = await chain.payeeHistory(address);
      return { ...h, verdict: h.incomingTxCount >= 3 ? "established" : "new / little history" };
    }
  }
  const lines = [`${token}: momentum ${["mixed", "positive", "cooling"][token.length % 3]}`, "Funding flat; spot volume steady.", "Not investment advice."];
  return endpoint === "deep-dive" ? { token, report: Array(8).fill(lines).flat() } : { token, brief: lines };
}
