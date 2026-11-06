import { handleVendor } from "@/lib/vendor-server";

/** Paid API (seller side): answers 402 until a valid Sui USDC payment is proven in X-PAYMENT. */
export async function GET(request: Request, ctx: { params: Promise<{ vendor: string; endpoint: string }> }) {
  const { vendor, endpoint } = await ctx.params;
  try {
    return await handleVendor(request, vendor, endpoint);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
