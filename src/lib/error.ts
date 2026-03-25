import * as Sentry from "@sentry/nextjs";

/**
 * Capture an error in Sentry and log it.
 * Safe to call even if Sentry is not configured (no-op).
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
    if (error instanceof Error) {
        Sentry.captureException(error, { extra: context });
    } else {
        Sentry.captureMessage(String(error), { extra: context, level: "error" });
    }
}
