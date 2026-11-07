import crypto from "node:crypto";
import { services } from "./services";
import { db, save } from "./store";
import { TatumSuiChain } from "./chain/tatum";
import { requirementFor, VENDORS } from "./vendors";
import { decodePayment, encodePaymentResponse, paymentRequired } from "./x402";

/** A 402 offer is only honoured for 10 minutes after it is issued (A6). */
const NONCE_TTL_MS = 10 * 60_000;

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
  // A6: a 402 offer expires 10 min after it was issued; drop it and make the client fetch a fresh one.
  if (Date.now() - new Date(issued.issuedAt).getTime() > NONCE_TTL_MS) {
    delete d.nonces[payment.payload.nonce];
    save();
    return paymentRequired(req, "payment request expired — fetch a new 402");
  }
  if (payment.network !== config.network) return paymentRequired(req, `wrong network ${payment.network}`);
  if (d.usedDigests.includes(payment.payload.digest)) return paymentRequired(req, "payment already used");

  const v = await chain.verifyPayment(payment.payload.digest, { payTo: req.payTo, coinType: req.asset, amount: req.amount });
  if (!v.ok) return paymentRequired(req, `payment not valid: ${v.reason}`);
  // A6: the payer claimed in the header must be the real on-chain sender (no borrowing someone else's tx).
  if (payment.payload.payer && v.payer && payment.payload.payer.toLowerCase() !== v.payer.toLowerCase())
    return paymentRequired(req, "payer does not match the transaction sender");
  // A6: "exact" scheme — reject overpayment too (underpayment is already caught by verifyPayment).
  if (v.amount !== undefined && BigInt(v.amount) !== BigInt(req.amount))
    return paymentRequired(req, `amount mismatch: paid ${v.amount}, required exactly ${req.amount}`);
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
  const tatum = chain instanceof TatumSuiChain ? chain : null;

  if (vendorId === "chainlens") {
    if (endpoint === "portfolio" || endpoint === "wallet-report") {
      if (tatum && address) {
        const balances = await tatum.allBalances(address);
        const recentTxs = endpoint === "wallet-report" ? await tatum.recentOutgoing(address, 10) : undefined;
        return { address, balances, recentTxs, source: "Tatum Sui RPC (mainnet, GraphQL)" };
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
