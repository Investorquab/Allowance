import { requireAuth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { runDay, simulateWeek } from "@/lib/demo";
import { resetServices } from "@/lib/services";
import { resetDb } from "@/lib/store";

/** { action: "run-day" | "simulate-week" | "reset" } */
export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  try {
    if (action === "run-day") return Response.json(await runDay({ autoAnswer: false }));
    if (action === "simulate-week") return Response.json({ days: (await simulateWeek()).length });
    if (action === "reset") {
      if (getConfig().mode === "live") return Response.json({ error: "Reset is disabled in live mode (memories live on Walrus)." }, { status: 400 });
      resetDb();
      resetServices();
      return Response.json({ ok: true });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
