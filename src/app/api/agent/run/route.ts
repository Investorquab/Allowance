import { runTask } from "@/lib/agent";

/** Run one agent task: { task: "why", path: "/api/vendors/<vendor>/<endpoint>?..." } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { task?: string; path?: string } | null;
  if (!body?.path?.startsWith("/api/vendors/") && !body?.path?.startsWith("https://"))
    return Response.json({ error: "path must be a vendor path or an https URL" }, { status: 400 });
  const outcome = await runTask({ task: body.task || "Manual request", path: body.path });
  return Response.json(outcome, { status: outcome.status === "error" ? 500 : 200 });
}
