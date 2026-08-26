import { describe, it, expect } from "vitest";
import { env } from "@/shared/config/env";

/**
 * The one property that keeps the E2E fixed verification code out of production:
 * `env.isE2E` is false unless `E2E_TEST=1` is explicitly set. vitest does not set
 * it, so this run stands in for any normal (deployed) environment.
 *
 * If this ever fails, the fixed `000000` code is reachable where a real customer
 * is — a security regression, not a flaky test.
 */
describe("E2E guard", () => {
  it("is off by default — env.isE2E is false without E2E_TEST=1", () => {
    expect(env.isE2E).toBe(false);
  });
});
