/**
 * fetchWithRetry — fetch résilient pour les API POS.
 *
 * Pourquoi : Shopify (2 req/s), Square, Lightspeed renvoient des 429 (rate-limit)
 * et des 5xx transitoires. Sans retry, un pic = sync en échec. Couplé au durcissement
 * de Collecte ② passe 1 (getCatalog lève sur non-OK), un seul 429 ferait échouer la
 * sync. Ici on retente AVANT de rendre la réponse au caller.
 *
 * Comportement :
 *  - retente sur 429 et 5xx, et sur erreur réseau (fetch qui throw) ;
 *  - respecte l'en-tête `Retry-After` (secondes ou date HTTP) sur 429 ;
 *  - back-off exponentiel plafonné + jitter sinon ;
 *  - après `maxRetries`, rend la DERNIÈRE réponse (le caller décide via res.ok)
 *    ou relance la dernière erreur réseau.
 *
 * `sleep` est injectable pour des tests déterministes (pas d'attente réelle).
 */
export type RetryOptions = {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    /** Source de jitter [0,1) injectable pour les tests. Défaut: Math.random. */
    jitter?: () => number;
};

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8000;

/** Lit un entier ≥0 depuis l'env (vide/invalide → fallback). 0 est valide. */
function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function backoffDelay(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    jitter: () => number,
): number {
    const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    // Jitter ±25 % pour éviter les "thundering herds".
    const delta = exp * 0.25 * (jitter() * 2 - 1);
    return Math.max(0, Math.round(exp + delta));
}

/** Parse `Retry-After` : soit un nombre de secondes, soit une date HTTP. ms ou null. */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
    if (!value) return null;
    const asInt = Number(value);
    if (Number.isFinite(asInt)) return Math.max(0, asInt * 1000);
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return Math.max(0, asDate - nowMs);
    return null;
}

export async function fetchWithRetry(
    input: string | URL,
    init?: RequestInit,
    opts: RetryOptions = {},
): Promise<Response> {
    const maxRetries = opts.maxRetries ?? envInt("POS_RETRY_MAX_RETRIES", DEFAULT_MAX_RETRIES);
    const baseDelayMs = opts.baseDelayMs ?? envInt("POS_RETRY_BASE_MS", DEFAULT_BASE_DELAY_MS);
    const maxDelayMs = opts.maxDelayMs ?? envInt("POS_RETRY_MAX_MS", DEFAULT_MAX_DELAY_MS);
    const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const jitter = opts.jitter ?? Math.random;

    let attempt = 0;
    for (;;) {
        let res: Response;
        try {
            res = await fetch(input, init);
        } catch (err) {
            // Erreur réseau : retenter tant qu'il reste des essais, sinon relancer.
            if (attempt >= maxRetries) throw err;
            await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, jitter));
            attempt++;
            continue;
        }

        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < maxRetries) {
            const retryAfter =
                res.status === 429 ? parseRetryAfter(res.headers.get("retry-after"), Date.now()) : null;
            const delay = retryAfter ?? backoffDelay(attempt, baseDelayMs, maxDelayMs, jitter);
            await sleep(delay);
            attempt++;
            continue;
        }

        return res;
    }
}
