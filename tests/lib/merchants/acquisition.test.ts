import { describe, it, expect } from "vitest";
import { computeCAC } from "@/lib/merchants/acquisition";

describe("computeCAC", () => {
  it("returns 0 if no acquisition cost", () => {
    expect(computeCAC({ cost_estimate_eur: 0, signed_at: new Date() })).toBe(0);
  });
  it("returns cost_estimate_eur for a single signed merchant", () => {
    expect(computeCAC({ cost_estimate_eur: 200, signed_at: new Date() })).toBe(200);
  });
  it("returns 0 if merchant not signed yet", () => {
    expect(computeCAC({ cost_estimate_eur: 200, signed_at: null })).toBe(0);
  });
});
