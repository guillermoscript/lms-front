import { describe, expect, it } from "vitest";
import { SALES_BLOCKED_SQLSTATE, isSalesBlockedError } from "../src/sales-block.js";

describe("isSalesBlockedError (#929)", () => {
  it("matches the SQLSTATE and the message", () => {
    expect(isSalesBlockedError({ code: SALES_BLOCKED_SQLSTATE, message: "x" })).toBe(true);
    expect(isSalesBlockedError({ message: "sales_blocked:fees" })).toBe(true);
  });
  it("ignores plan limits and junk", () => {
    expect(isSalesBlockedError({ code: "LM001", message: "plan_limit_exceeded:courses" })).toBe(false);
    expect(isSalesBlockedError(null)).toBe(false);
  });
});
