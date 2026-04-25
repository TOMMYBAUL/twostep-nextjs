/**
 * Wrapper Replicate API pour CLIP image embeddings (Cycle 8 — Tier 4 cascade).
 *
 * Modèle V1 : `andreasjansson/clip-features` (CLIP base OpenAI ViT-L/14, 768 dims).
 * Cf. docs/cascade/CLIP-V1-DESIGN.md pour le rationale + migration FashionCLIP V1.5.
 *
 * Replicate API : appel async (POST /v1/predictions → polling /v1/predictions/{id}).
 * Latence : ~2-5s par image (cold start) → ~1-2s warm.
 * Coût : ~$0.001/inference.
 *
 * Auth : REPLICATE_API_TOKEN env var (à configurer demain par Thomas).
 */

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

// Version hash du modèle CLIP-features. À VÉRIFIER au moment de l'activation
// car Replicate peut publier de nouvelles versions. Récupérable via :
//   GET https://api.replicate.com/v1/models/andreasjansson/clip-features/versions
// → prendre le `latest_version.id`.
//
// Cette constante peut être surchargée via REPLICATE_CLIP_VERSION env var.
const DEFAULT_CLIP_FEATURES_VERSION =
    "75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a";

const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 30_000;

export interface ClipEmbedResult {
    embedding: number[]; // 768 dims pour CLIP-features
    model: string;
    latency_ms: number;
}

/**
 * Embed une image via Replicate CLIP-features.
 *
 * @param imageUrl — URL publique HTTPS de l'image (Replicate doit pouvoir la pull)
 * @throws Error si REPLICATE_API_TOKEN absent, image inaccessible, timeout, ou format inattendu
 */
export async function embedImageViaReplicate(imageUrl: string): Promise<ClipEmbedResult> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
        throw new Error("REPLICATE_API_TOKEN not configured");
    }

    const version = process.env.REPLICATE_CLIP_VERSION ?? DEFAULT_CLIP_FEATURES_VERSION;
    const t0 = performance.now();

    // 1. Lance la prediction
    const createRes = await fetch(`${REPLICATE_API_BASE}/predictions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            version,
            input: { inputs: imageUrl },
        }),
    });

    if (!createRes.ok) {
        const body = await createRes.text();
        throw new Error(`Replicate create failed (${createRes.status}): ${body.slice(0, 200)}`);
    }

    const prediction = (await createRes.json()) as {
        id: string;
        status: string;
        urls?: { get?: string };
    };

    // 2. Poll jusqu'à completion (succeeded / failed / canceled)
    const pollUrl = prediction.urls?.get ?? `${REPLICATE_API_BASE}/predictions/${prediction.id}`;
    let attempt = 0;
    const maxAttempts = Math.ceil(POLL_TIMEOUT_MS / POLL_INTERVAL_MS);

    while (attempt < maxAttempts) {
        await sleep(POLL_INTERVAL_MS);
        attempt++;

        const pollRes = await fetch(pollUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!pollRes.ok) continue; // tolérant aux 5xx ponctuels

        const status = (await pollRes.json()) as {
            status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
            output?: unknown;
            error?: string;
        };

        if (status.status === "succeeded") {
            const embedding = parseClipFeatureOutput(status.output);
            return {
                embedding,
                model: `replicate-clip-features:${version.slice(0, 8)}`,
                latency_ms: Math.round(performance.now() - t0),
            };
        }
        if (status.status === "failed" || status.status === "canceled") {
            throw new Error(`Replicate prediction ${status.status}: ${status.error ?? "no error message"}`);
        }
    }

    throw new Error(`Replicate prediction timeout after ${POLL_TIMEOUT_MS}ms`);
}

/**
 * Parse la sortie Replicate CLIP-features.
 *
 * Format attendu (v1) : array d'objets `{input, embedding: number[]}` OU directement
 * un array de 768 numbers. Le wrapper gère les 2 cas pour résilience.
 */
function parseClipFeatureOutput(output: unknown): number[] {
    // Cas 1 : array d'objets
    if (Array.isArray(output) && output.length > 0) {
        const first = output[0];
        if (
            first &&
            typeof first === "object" &&
            "embedding" in first &&
            Array.isArray((first as { embedding: unknown }).embedding)
        ) {
            return (first as { embedding: number[] }).embedding;
        }
        // Cas 2 : array direct de numbers
        if (typeof output[0] === "number") {
            return output as number[];
        }
    }
    throw new Error("Replicate CLIP-features output format unexpected");
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
