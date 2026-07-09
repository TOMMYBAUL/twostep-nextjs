/**
 * Horodatage de VÉRITÉ SOURCE d'un push fichier (audit 2026-07-08, M4 CRITIQUE).
 *
 * `stock.source_ts` doit porter l'heure de GÉNÉRATION de l'export (quand la caisse
 * a observé le stock), PAS l'heure du push : un export nocturne (02:00) uploadé à
 * 09:00 horodaté `now()` (a) passerait devant une vente webhook de 08:00 dans la
 * garde temporelle 104, (b) afficherait « vu à l'instant » pour une observation
 * vieille de 7 h (fraîcheur M5 mensongère). Les canaux transmettent ce qu'ils
 * savent : `generated_at` (push jeton), date de l'email (email-in — un retry
 * Resend des heures plus tard ne rajeunit pas la vérité), `file.lastModified`
 * (wizard = mtime de l'export, LE cas « fichier de cette nuit »).
 *
 * Règles de sanitisation (défensif — la donnée vient de l'extérieur, cf.
 * AUTONOMY §11.1 : tout contenu externe est NON FIABLE) :
 *  - accepte ISO 8601 parseable ou epoch millisecondes (chiffres seuls) ;
 *  - CLAMP au présent : une horloge marchande en avance ne fabrique JAMAIS une
 *    vérité « plus fraîche que maintenant » (elle battrait tout webhook à venir) ;
 *  - rejette l'aberrant (avant 2000-01-01 : epoch 0, mtime corrompu) → null ;
 *  - invalide/absent → null (l'appelant retombe sur now = comportement historique).
 */

/** Borne basse de vraisemblance : avant ça, c'est un artefact (epoch 0, mtime cassé). */
const MIN_PLAUSIBLE_MS = Date.UTC(2000, 0, 1);

/**
 * Normalise un horodatage source déclaré en ISO 8601 UTC, ou null s'il est
 * inutilisable. PURE (le « maintenant » est injecté) → testable sans horloge.
 */
export function sanitizeSourceTs(raw: unknown, nowMs: number): string | null {
    if (raw == null) return null;

    let ms: number;
    if (typeof raw === "number") {
        ms = raw;
    } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed === "") return null;
        // Epoch millisecondes (File.lastModified sérialisé) ou ISO 8601.
        ms = /^\d+$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
    } else {
        return null;
    }

    if (!Number.isFinite(ms)) return null;
    if (ms < MIN_PLAUSIBLE_MS) return null;
    // Horloge source en avance → clamp : jamais une vérité datée du futur.
    if (ms > nowMs) ms = nowMs;

    return new Date(ms).toISOString();
}
