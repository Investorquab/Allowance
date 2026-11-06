import { connection } from "next/server";
import { dashboardState, morningBrief } from "@/lib/stats";

export async function GET() {
  await connection();
  try {
    return Response.json({ ...(await dashboardState()), brief: morningBrief() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
