import type { PaymentRequirement } from "./types";

/**
 * x402-style payments settled on Sui.
 *
 * 1. Client calls a paid resource with no payment  → server answers HTTP 402 + { x402Version, accepts: [PaymentRequirement] }
 * 2. Client pays on Sui (USDC to `payTo`), then retries with header  X-PAYMENT: base64(JSON PaymentPayload)
 * 3. Server verifies the Sui transaction (via Tatum RPC), checks the digest was never used, and serves the resource
 *    with header  X-PAYMENT-RESPONSE: base64(JSON { success, digest, network })
 */
export const X402_VERSION = 1;

export interface PaymentRequiredBody {
  x402Version: number;
  error?: string;
  accepts: PaymentRequirement[];
}

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: { digest: string; payer: string; nonce: string };
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const unb64 = <T>(s: string): T => JSON.parse(Buffer.from(s, "base64").toString("utf8")) as T;

export function paymentRequired(req: PaymentRequirement, error?: string): Response {
  const body: PaymentRequiredBody = { x402Version: X402_VERSION, accepts: [req], ...(error ? { error } : {}) };
  return Response.json(body, { status: 402 });
}

export const encodePayment = (p: PaymentPayload) => b64(p);
export function decodePayment(header: string | null): PaymentPayload | null {
  if (!header) return null;
  try {
    const p = unb64<PaymentPayload>(header);
    if (p?.x402Version !== X402_VERSION || p.scheme !== "exact" || !p.payload?.digest) return null;
    return p;
  } catch {
    return null;
  }
}
export const encodePaymentResponse = (o: { success: boolean; digest: string; network: string }) => b64(o);

export function parsePaymentRequired(body: unknown): PaymentRequirement | null {
  const b = body as PaymentRequiredBody;
  if (!b || b.x402Version !== X402_VERSION || !Array.isArray(b.accepts) || !b.accepts.length) return null;
  return b.accepts[0];
}
