import { timingSafeEqual } from "node:crypto";
import { getConfig } from "./config";

/**
 * Guards the admin POST routes (approvals, agent/run, demo, memory). The public
 * vendor APIs (`/api/vendors/*`) must NOT use this — they stay open so any 402
 * client can pay.
 *
 * Returns a 401 `Response` when the caller is not authorised, or `null` to proceed.
 *
 *  - When `ALLOWANCE_ADMIN_TOKEN` is set, a route requires `Authorization: Bearer <token>`.
 *  - When it is unset: allowed in sim mode (local dev convenience), but denied in
 *    live mode, because an unprotected route there can move real USDC.
 */
export function requireAuth(request: Request): Response | null {
  const { adminToken, mode } = getConfig();
  if (!adminToken) {
    if (mode === "live") return unauthorized("Set ALLOWANCE_ADMIN_TOKEN to use admin actions in live mode.");
    return null; // sim: no token configured, allow local dev
  }
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m || !safeEqual(m[1].trim(), adminToken)) return unauthorized("Missing or invalid admin token.");
  return null;
}

/** Constant-time comparison; false on any length mismatch without leaking length via timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function unauthorized(message: string): Response {
  return Response.json({ error: message }, { status: 401, headers: { "www-authenticate": "Bearer" } });
}
