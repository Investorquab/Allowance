import { runJob, runTask } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";

type Step = { task?: string; path?: string };
const validPath = (p?: string) => Boolean(p && (p.startsWith("/api/vendors/") || p.startsWith("https://")));

/**
 * Run one agent task: { task: "why", path: "/api/vendors/<vendor>/<endpoint>?..." }
 * — or a multi-step job: { job: "label", tasks: [{ task, path }, ...] }. A job groups its API calls
 *   so the dashboard can show what the whole run spent and which step ran up the bill.
 */
export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { task?: string; path?: string; job?: string; tasks?: Step[] } | null;

  if (Array.isArray(body?.tasks)) {
    const tasks = body.tasks.map((t) => ({ task: t.task || "Manual request", path: t.path! }));
    if (!tasks.length || !tasks.every((t) => validPath(t.path)))
      return Response.json({ error: "each task path must be a vendor path or an https URL" }, { status: 400 });
    const { job, outcomes } = await runJob(body.job || "Research run", tasks);
    return Response.json({ job, outcomes });
  }

  if (!validPath(body?.path))
    return Response.json({ error: "path must be a vendor path or an https URL" }, { status: 400 });
  const outcome = await runTask({ task: body!.task || "Manual request", path: body!.path! });
  return Response.json(outcome, { status: outcome.status === "error" ? 500 : 200 });
}
