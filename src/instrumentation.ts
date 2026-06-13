import * as Sentry from "@sentry/nextjs";

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("../sentry.server.config");
    }

    if (process.env.NEXT_RUNTIME === "edge") {
        await import("../sentry.edge.config");
    }
}

// Sans cet export, les erreurs non catchées des Server Components et route
// handlers ne remontent JAMAIS à Sentry (seuls les captureError explicites
// partaient). Pour un solo builder sans astreinte, c'est l'angle mort n°1.
export const onRequestError = Sentry.captureRequestError;
