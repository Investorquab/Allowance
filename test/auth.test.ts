import { afterEach, describe, expect, it } from "vitest";
import { requireAuth } from "../src/lib/auth";

const post = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/demo", { method: "POST", headers });

describe("requireAuth (A1)", () => {
  afterEach(() => {
    delete process.env.ALLOWANCE_ADMIN_TOKEN;
    delete process.env.ALLOWANCE_MODE;
  });

  it("401s a POST with no Authorization header when a token is configured", () => {
    process.env.ALLOWANCE_ADMIN_TOKEN = "secret-token";
    expect(requireAuth(post())?.status).toBe(401);
  });

  it("401s a POST with the wrong token", () => {
    process.env.ALLOWANCE_ADMIN_TOKEN = "secret-token";
    expect(requireAuth(post({ authorization: "Bearer nope" }))?.status).toBe(401);
  });

  it("allows a POST carrying the right Bearer token", () => {
    process.env.ALLOWANCE_ADMIN_TOKEN = "secret-token";
    expect(requireAuth(post({ authorization: "Bearer secret-token" }))).toBeNull();
  });

  it("sim mode with no token configured: allows (local-dev convenience)", () => {
    process.env.ALLOWANCE_MODE = "sim";
    expect(requireAuth(post())).toBeNull();
  });

  it("live mode with no token configured: refuses (real money)", () => {
    process.env.ALLOWANCE_MODE = "live";
    expect(requireAuth(post())?.status).toBe(401);
  });
});
