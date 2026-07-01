import * as Sentry from "@sentry/nextjs";

/**
 * Capture an error in Sentry and log it.
 * Safe to call even if Sentry is not configured (no-op).
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
    if (error instanceof Error) {
        Sentry.captureException(error, { extra: context });
        return;
    }
    // Les erreurs Supabase/PostgREST sont des OBJETS PLATS (pas des `Error`) portant
    // { message, code, details, hint }. `String(error)` = "[object Object]" → tout le
    // diagnostic DB est PERDU en Sentry (leçon E4, review E4/maillon SCALE). On promeut
    // en `Error` en préservant le message ET les champs bruts dans `extra`, pour que les
    // échecs de lot d'ingestion (create-product-insert/stock-upsert-batch…) soient
    // DIAGNOSTIQUABLES — précisément là où on en a le plus besoin (à l'échelle).
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
        const e = error as { message: string; code?: unknown; details?: unknown; hint?: unknown };
        Sentry.captureException(Object.assign(new Error(e.message), { cause: error }), {
            extra: { ...context, code: e.code, details: e.details, hint: e.hint },
        });
        return;
    }
    Sentry.captureMessage(String(error), { extra: context, level: "error" });
}
