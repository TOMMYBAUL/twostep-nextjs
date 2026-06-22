import { captureError } from "@/lib/error";

type SIRETResult = {
    /** Peut-on laisser le marchand passer l'étape SIRET ? (false = rejet dur : format / introuvable / fermé) */
    valid: boolean;
    /**
     * true = le SIRET n'a PAS pu être confirmé auprès de l'INSEE (token absent, INSEE en
     * panne / token expiré, erreur réseau). Le marchand passe quand même (fail-open assumé,
     * on ne bloque pas l'onboarding) MAIS son compte doit être marqué `pending` → vérification
     * manuelle. C'est l'inverse d'un faux positif silencieux : on dit la vérité « non vérifié ».
     */
    pending: boolean;
    name: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    nafCode: string | null;
    active: boolean;
    error?: string;
};

/** INSEE masque les champs des établissements non-diffusibles par la chaîne littérale `[ND]`. */
function cleanInsee(value: unknown): string | null {
    const s = (value ?? "").toString().trim();
    if (!s || s === "[ND]") return null;
    return s;
}

/**
 * Résultat « non vérifié » : le marchand passe (on ne bloque pas l'onboarding faute de
 * pouvoir joindre l'INSEE) mais on le DIT (`pending:true`) au lieu de prétendre que c'est
 * validé. Le caller (route → form → metadata) marque alors le compte en attente.
 */
function unverified(): SIRETResult {
    return { valid: true, pending: true, name: null, address: null, city: null, postalCode: null, nafCode: null, active: true };
}

export async function verifySIRET(siret: string): Promise<SIRETResult> {
    if (!/^\d{14}$/.test(siret)) {
        return { valid: false, pending: false, name: null, address: null, city: null, postalCode: null, nafCode: null, active: false, error: "Le SIRET doit contenir 14 chiffres" };
    }

    const token = process.env.INSEE_API_TOKEN;
    if (!token) {
        // Config attendue (token non posé en prod aujourd'hui) → PAS une erreur Sentry,
        // mais on ne ment pas : non vérifié = pending.
        return unverified();
    }

    try {
        const res = await fetch(`https://api.insee.fr/entreprises/sirene/V3.11/siret/${siret}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });

        if (res.status === 404) {
            return { valid: false, pending: false, name: null, address: null, city: null, postalCode: null, nafCode: null, active: false, error: "SIRET introuvable" };
        }

        if (!res.ok) {
            // Token présent mais l'INSEE répond mal (401 expiré, 429, 5xx) : ce n'est PAS de la
            // config attendue → on le rend VISIBLE (Sentry) tout en laissant passer en pending.
            captureError(new Error(`INSEE verifySIRET HTTP ${res.status}`), { siret, status: res.status });
            return unverified();
        }

        const data = await res.json();
        const etab = data?.etablissement;
        if (!etab) {
            // 200 sans établissement = forme de réponse inattendue → non vérifié + visible.
            captureError(new Error("INSEE verifySIRET 200 sans etablissement"), { siret });
            return unverified();
        }

        const periods = etab.periodesEtablissement;
        // On ne rejette « fermé » que si l'INSEE l'affirme explicitement. Un établissement
        // non-diffusible peut masquer ses champs identité/adresse mais conserve son état admin.
        if (Array.isArray(periods) && periods.length > 0) {
            const state = periods[0]?.etatAdministratifEtablissement;
            if (state && state !== "A") {
                return { valid: false, pending: false, name: null, address: null, city: null, postalCode: null, nafCode: null, active: false, error: "Cet établissement est fermé" };
            }
        }

        const unite = etab.uniteLegale ?? {};
        const adresse = etab.adresseEtablissement ?? {};

        const denomination = cleanInsee(unite.denominationUniteLegale);
        const prenom = cleanInsee(unite.prenomUsuelUniteLegale);
        const nom = cleanInsee(unite.nomUniteLegale);
        const name = denomination ?? [prenom, nom].filter(Boolean).join(" ").trim() ?? null;

        const voie = [cleanInsee(adresse.numeroVoieEtablissement), cleanInsee(adresse.typeVoieEtablissement), cleanInsee(adresse.libelleVoieEtablissement)]
            .filter(Boolean)
            .join(" ")
            .trim();

        return {
            valid: true,
            pending: false,
            active: true,
            name: name || null,
            address: voie || null,
            city: cleanInsee(adresse.libelleCommuneEtablissement),
            postalCode: cleanInsee(adresse.codePostalEtablissement),
            nafCode: cleanInsee(unite.activitePrincipaleUniteLegale),
        };
    } catch (err) {
        // Réseau / JSON malformé : non vérifié, rendu visible (≠ panne silencieuse fail-open).
        captureError(err, { siret, phase: "verifySIRET" });
        return unverified();
    }
}
