/**
 * Cloudflare Vectorize V2 — REST API client (Cycle 8 — Tier 4 cascade).
 *
 * Two-Step tourne sur Vercel + Next.js, donc pas de Workers binding direct.
 * On utilise l'API REST publique de Cloudflare :
 *   https://api.cloudflare.com/client/v4/accounts/{accountId}/vectorize/v2/indexes/{indexName}/...
 *
 * Auth : Cloudflare API token avec permission `Account.Vectorize.Edit`.
 * Account ID : déjà en env via R2_ACCOUNT_ID (R2 et Vectorize partagent l'account).
 *
 * Limites V1 (free tier) :
 *  - 10M vectors / index — on est large
 *  - 5000 vectors / batch upsert HTTP — on découpera si besoin
 *  - Max 1536 dims — CLIP-features 768 = OK
 *  - 50 résultats max par query (avec metadata)
 */

const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const HTTP_TIMEOUT_MS = 10_000;

export interface VectorizeVector {
    /** ID unique du vector — on utilise `${product_id}` directement. */
    id: string;
    values: number[];
    metadata?: Record<string, string | number | boolean | null>;
    namespace?: string;
}

export interface VectorizeQueryMatch {
    id: string;
    score: number; // similarité cosine [0, 1]
    metadata?: Record<string, unknown>;
}

export interface VectorizeQueryResponse {
    matches: VectorizeQueryMatch[];
}

/** Configuration runtime — extrait des env vars à chaque call (pas singleton, pour test). */
function getConfig(): { accountId: string; token: string; indexName: string } {
    const accountId = process.env.R2_ACCOUNT_ID; // partagé avec R2
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const indexName = process.env.CLOUDFLARE_VECTORIZE_INDEX ?? "twostep-products-v1";

    if (!accountId) throw new Error("R2_ACCOUNT_ID not configured (Vectorize partage l'account avec R2)");
    if (!token) throw new Error("CLOUDFLARE_API_TOKEN not configured");

    return { accountId, token, indexName };
}

function buildUrl(path: string): string {
    const { accountId, indexName } = getConfig();
    return `${CF_API_BASE}/accounts/${accountId}/vectorize/v2/indexes/${indexName}${path}`;
}

async function fetchVectorize<T>(
    path: string,
    init: RequestInit,
): Promise<T> {
    const { token } = getConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
        const res = await fetch(buildUrl(path), {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...(init.headers ?? {}),
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Vectorize ${path} ${res.status}: ${body.slice(0, 200)}`);
        }
        const json = (await res.json()) as { success: boolean; result: T; errors?: unknown[] };
        if (!json.success) {
            throw new Error(`Vectorize ${path} returned success=false: ${JSON.stringify(json.errors).slice(0, 200)}`);
        }
        return json.result;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Upsert un ou plusieurs vectors (créé ou remplace).
 * Format API V2 : NDJSON (newline-delimited JSON), 1 ligne par vector.
 */
export async function upsertVectors(vectors: VectorizeVector[]): Promise<{ count: number }> {
    if (vectors.length === 0) return { count: 0 };
    if (vectors.length > 5000) {
        throw new Error(`Too many vectors in one batch (${vectors.length} > 5000) — split caller-side`);
    }
    const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n");

    const result = await fetchVectorize<{ mutationId?: string; count?: number }>(
        "/upsert",
        {
            method: "POST",
            headers: { "Content-Type": "application/x-ndjson" },
            body: ndjson,
        },
    );
    return { count: result.count ?? vectors.length };
}

/** Query top-K cosine similarity, optionnel filter sur metadata. */
export async function queryVector(
    embedding: number[],
    options: {
        topK?: number;
        filter?: Record<string, string | number | boolean>;
        returnValues?: boolean;
        returnMetadata?: "all" | "indexed" | "none";
    } = {},
): Promise<VectorizeQueryResponse> {
    const body = {
        vector: embedding,
        topK: Math.min(options.topK ?? 5, 50),
        filter: options.filter,
        returnValues: options.returnValues ?? false,
        returnMetadata: options.returnMetadata ?? "all",
    };

    return fetchVectorize<VectorizeQueryResponse>(
        "/query",
        {
            method: "POST",
            body: JSON.stringify(body),
        },
    );
}

/**
 * Récupère un vector existant par ID (Cycle 9 — Tier 4 cascade query).
 * Renvoie null si l'ID n'existe pas dans l'index.
 *
 * Note : la doc Vectorize REST API évolue rapidement. L'endpoint exact peut
 * changer (`/get-by-ids` ou `/getByIds`). Si erreur 404 sur une ID connue,
 * vérifier la doc Cloudflare actuelle.
 */
export async function getVectorById(id: string): Promise<{
    id: string;
    values: number[];
    metadata?: Record<string, unknown>;
} | null> {
    try {
        const result = await fetchVectorize<Array<{
            id: string;
            values: number[];
            metadata?: Record<string, unknown>;
        }>>(
            `/get-by-ids`,
            {
                method: "POST",
                body: JSON.stringify({ ids: [id] }),
            },
        );
        if (!result || result.length === 0) return null;
        return result[0];
    } catch (err) {
        // Si l'ID n'existe pas, certaines APIs renvoient 404 plutôt qu'un array vide.
        if (err instanceof Error && /404/.test(err.message)) return null;
        throw err;
    }
}

/** Delete un vector par ID (cleanup quand un produit est supprimé). */
export async function deleteVectorById(id: string): Promise<void> {
    await fetchVectorize(
        `/delete-by-ids`,
        {
            method: "POST",
            body: JSON.stringify({ ids: [id] }),
        },
    );
}
