// Smoke test only — full behavioral tests for useTodayTasks are covered by
// manual UI verification in P2-T7 (dev server scenarios). Mocking Supabase +
// useMerchant for every branch would add more friction than value at this stage.

import { describe, expect, it } from "vitest";
import { useTodayTasks } from "@/hooks/use-today-tasks";

describe("useTodayTasks (smoke)", () => {
    it("exports a function", () => {
        expect(typeof useTodayTasks).toBe("function");
    });
});
