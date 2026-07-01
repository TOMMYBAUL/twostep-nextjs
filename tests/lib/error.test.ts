import { describe, it, expect, vi, beforeEach } from "vitest";

// Sentry mocké : on prouve le PONT error→Sentry (captureException vs captureMessage,
// et surtout que les OBJETS d'erreur Supabase/PostgREST ne se perdent PAS en
// "[object Object]" — leçon E4 + revue maillon SCALE).
const captureException = vi.fn();
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
    captureException: (...a: unknown[]) => captureException(...a),
    captureMessage: (...a: unknown[]) => captureMessage(...a),
}));

import { captureError } from "@/lib/error";

describe("captureError — diagnostic préservé (jamais « [object Object] » en Sentry)", () => {
    beforeEach(() => {
        captureException.mockClear();
        captureMessage.mockClear();
    });

    it("Error natif → captureException avec l'objet Error et le contexte en extra", () => {
        const err = new Error("boom");
        captureError(err, { lib: "x", phase: "y" });
        expect(captureException).toHaveBeenCalledWith(err, { extra: { lib: "x", phase: "y" } });
        expect(captureMessage).not.toHaveBeenCalled();
    });

    it("erreur PostgREST (objet plat) → captureException avec message RÉEL + code/details/hint en extra", () => {
        // Forme d'une erreur Supabase : objet NON-Error. Avant le fix : String(err) =
        // "[object Object]" via captureMessage = diagnostic DB perdu.
        const pgErr = { message: "duplicate key value violates unique constraint", code: "23505", details: "slug already exists", hint: null };
        captureError(pgErr, { lib: "ingest/snapshot", phase: "create-product-insert", merchantId: "m1" });

        expect(captureMessage).not.toHaveBeenCalled();
        expect(captureException).toHaveBeenCalledTimes(1);
        const [errArg, opts] = captureException.mock.calls[0] as [Error, { extra: Record<string, unknown> }];
        expect(errArg).toBeInstanceOf(Error);
        expect(errArg.message).toBe("duplicate key value violates unique constraint"); // PAS "[object Object]"
        expect(opts.extra).toMatchObject({
            lib: "ingest/snapshot",
            phase: "create-product-insert",
            merchantId: "m1",
            code: "23505",
            details: "slug already exists",
        });
    });

    it("valeur non-objet sans message (string/number) → fallback captureMessage (comportement legacy)", () => {
        captureError("plain string failure", { phase: "z" });
        expect(captureException).not.toHaveBeenCalled();
        expect(captureMessage).toHaveBeenCalledWith("plain string failure", { extra: { phase: "z" }, level: "error" });
    });

    it("null → fallback captureMessage (ne throw jamais)", () => {
        expect(() => captureError(null)).not.toThrow();
        expect(captureMessage).toHaveBeenCalledWith("null", { extra: undefined, level: "error" });
    });
});
