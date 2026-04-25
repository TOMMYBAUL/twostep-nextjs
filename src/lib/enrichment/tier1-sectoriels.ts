/**
 * Tier 1 — sources sectorielles à 100% (score 0.99)
 *
 * Cf. brain `06-Tech/Socle-identification-cascade.md` Tier 1 :
 *   "Identifiants imposés par réglementation, pas par marchand"
 *
 * Sources V1 :
 *   - CIP-13 (médicaments FR) → api-medicaments.fr (BDPM, GRATUIT, ANSM)
 *   - ISBN-13 (livres) → Dilicom FEL DIFFÉRÉ V2 (concurrence Place des Libraires)
 *
 * Toutes les fonctions ici retournent `null` si rien trouvé — jamais d'exception.
 */

export type Tier1Match = {
    canonical_name: string;
    brand: string | null;
    category: string | null;
    /** ID natif retourné par la source pour traçabilité. */
    sectorial_id: string;
    source: "tier1_cip_bdpm" | "tier1_isbn_dilicom";
};

const FETCH_TIMEOUT_MS = 6_000;

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/**
 * Lookup CIP-13 (médicaments FR) via base ouverte BDPM (api-medicaments.fr).
 *
 * BDPM = Base de Données Publique des Médicaments — référentiel ANSM officiel.
 * Endpoint :
 *   GET https://api-medicaments.fr/medicaments?cip13={cip}
 * Retourne un array de médicaments (souvent 1 entrée).
 *
 * Note : api-medicaments.fr est non-officiel mais largement utilisé. En cas
 * d'indisponibilité, on retourne null (Tier 6 EAN-Search peut prendre le relais).
 */
export async function lookupCipBdpm(cip: string): Promise<Tier1Match | null> {
    if (!/^340\d{10}$/.test(cip)) return null;

    type Medicament = {
        denomination?: string;
        forme_pharmaceutique?: string;
        titulaires?: string[] | string;
        presentations?: Array<{ cip13?: string }>;
    };

    const data = await fetchJson<Medicament[]>(
        `https://api-medicaments.fr/medicaments?cip13=${encodeURIComponent(cip)}`,
    );
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    const med = data[0];
    if (!med.denomination) return null;

    const titulaire = Array.isArray(med.titulaires)
        ? med.titulaires[0]
        : med.titulaires ?? null;

    return {
        canonical_name: med.denomination,
        brand: titulaire ?? null,
        category: med.forme_pharmaceutique ?? "médicament",
        sectorial_id: cip,
        source: "tier1_cip_bdpm",
    };
}

/**
 * Lookup ISBN-13 (livres) via Dilicom FEL.
 *
 * DIFFÉRÉ V2 — décision Thomas + audit angles morts 2026-04-24 :
 *   - 15€/mois Dilicom non viable à 0 marchand librairie pilote
 *   - Concurrence frontale Place des Libraires (800 librairies indé FR à 150€/an)
 *   - Two-Step évite le vertical livre V1
 *
 * Stub pour conserver la signature et activer plus tard sans refactor caller.
 */
export async function lookupIsbnDilicom(isbn: string): Promise<Tier1Match | null> {
    void isbn;
    return null;
}
