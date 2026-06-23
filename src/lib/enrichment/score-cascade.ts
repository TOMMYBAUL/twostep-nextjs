/**
 * Scoring cascade — Phase A3 (socle identification produit).
 *
 * Source de vérité : brain `06-Tech/Socle-identification-cascade.md`.
 *
 * Règle d'or :
 *   - score ≥ 0.95 → AUTO-CLEAN visible feed consumer
 *   - 0.70 ≤ score < 0.95 → QUEUE VALIDATION 1-tap marchand
 *   - score < 0.70 → MASQUÉ feed public (visible dashboard marchand seul)
 *
 * Multi-source voting : si 2+ tiers convergent (même EAN canonique trouvé),
 * on applique un boost pour franchir le seuil 0.95 plus facilement.
 */

export type Tier =
    | "tier1_gs1"            // GS1 Verified / CodeOnline — source AUTORITATIVE (déposée par la marque)
    | "tier1_isbn"
    | "tier1_cip"
    | "tier1_gtin_validated"
    | "tier_kicksdb"         // KicksDB (StockX/GOAT) — référentiel sneakers fiable
    | "tier2_off"            // Open Food Facts
    | "tier2_obf"            // Open Beauty Facts
    | "tier2_opf"            // Open Products Facts
    | "tier2_icecat"         // Open Icecat (non wiré V1, futur Phase 1.5)
    | "tier3_google_pc"      // Google Product Catalog (Merchant Center)
    | "tier4_clip"           // CLIP image embedding (Vectorize)
    | "tier5_bert"           // BERT entity matching (Ditto self-host)
    | "tier6_eansearch";     // EAN-Search EU fallback

/**
 * Score nominal par tier — valeurs de la fiche brain.
 * Quand un tier matche, on retient ce score-là.
 */
export const TIER_SCORES: Record<Tier, number> = {
    tier1_gs1: 0.99, // autoritatif (déposé par le propriétaire de marque) — certitude max
    tier1_isbn: 0.99,
    tier1_cip: 0.99,
    tier1_gtin_validated: 0.99,
    tier_kicksdb: 0.97, // sneakers : agrège StockX/GOAT, très fiable sur l'identité modèle
    tier2_off: 0.97,
    tier2_obf: 0.97,
    tier2_opf: 0.97,
    tier2_icecat: 0.97,
    tier3_google_pc: 0.95,
    tier4_clip: 0.92,
    tier5_bert: 0.85,
    tier6_eansearch: 0.9,
};

/** Boost de convergence : si N tiers matchent, on ajoute (N-1) × 0.015, plafonné. */
const CONVERGENCE_BOOST_PER_EXTRA_TIER = 0.015;
const CONVERGENCE_BOOST_CAP = 0.05;
const SCORE_CAP = 0.999;

/**
 * Score combiné = max(scores des tiers matchés) + boost si plusieurs convergent.
 * - 0 tier matché → 0
 * - 1 tier → score nominal du tier
 * - 2+ tiers → max + boost
 *
 * Cap dur à 0.999 pour ne jamais "auto-promote" à 1.000 sans certitude réelle.
 */
export function combineTierScores(tiers: Tier[]): number {
    if (tiers.length === 0) return 0;
    const scores = tiers.map((t) => TIER_SCORES[t]);
    const max = Math.max(...scores);
    if (tiers.length === 1) return Math.min(max, SCORE_CAP);

    const extraTiers = tiers.length - 1;
    const boost = Math.min(
        extraTiers * CONVERGENCE_BOOST_PER_EXTRA_TIER,
        CONVERGENCE_BOOST_CAP,
    );
    return Math.min(max + boost, SCORE_CAP);
}

export type ReviewStatus = "validated" | "pending" | "masked";

export const SCORE_THRESHOLDS = {
    /** ≥ 0.95 : auto-clean visible feed consumer (Google LFP + app). */
    auto_publish: 0.95,
    /** ≥ 0.70 : visible dashboard marchand, queue 1-tap pour passer en validated. */
    review_queue: 0.7,
    // < 0.70 : masqué — uniquement visible dashboard marchand pour fix manuel.
} as const;

/**
 * Map score → review_status selon les seuils Two-Step.
 * Utilisé par le wiring final (catalog/import, invoices/validate, wizard, POS sync).
 */
export function scoreToReviewStatus(score: number | null | undefined): ReviewStatus {
    if (score == null) return "masked";
    if (score >= SCORE_THRESHOLDS.auto_publish) return "validated";
    if (score >= SCORE_THRESHOLDS.review_queue) return "pending";
    return "masked";
}

/**
 * Map score → visible (true uniquement si auto-publish atteint).
 * Note : un produit en `pending` reste invisible feed public ; il devient
 * visible via 1-tap marchand qui le force à `validated`.
 */
export function scoreToVisible(score: number | null | undefined): boolean {
    return scoreToReviewStatus(score) === "validated";
}

/**
 * Résultat d'un passage cascade : score, tiers matchés, EAN canonique.
 * Utilisé par cascade-engine (à venir) et stocké dans products.identification_*.
 */
export interface CascadeOutcome {
    score: number;
    tiers_matched: Tier[];
    canonical_ean: string | null;
    canonical_name: string | null;
    review_status: ReviewStatus;
    visible: boolean;
}

/**
 * Construit l'outcome complet à partir des tiers matchés + EAN canonique trouvé.
 *
 * @param opts.identityConcords — garde de concordance d'identité (D7, zéro faux
 *   positif). `false` = le caller a vérifié que le nom résolu par la source
 *   externe NE concorde PAS avec le nom saisi par le marchand (EAN mal saisi /
 *   réutilisé → identité réelle mais FAUSSE). Dans ce cas on ne fait confiance à
 *   AUCUNE source seule : un produit qui aurait été auto-publié (`validated`) est
 *   rétrogradé en `pending` (review 1-tap), jamais publié en silence.
 *   `true`/`undefined` = concordant OU non évaluable (pas de nom des deux côtés)
 *   → aucun downgrade.
 */
export function buildCascadeOutcome(
    tiers_matched: Tier[],
    canonical_ean: string | null,
    canonical_name: string | null,
    opts?: { identityConcords?: boolean },
): CascadeOutcome {
    const score = combineTierScores(tiers_matched);
    let review_status = scoreToReviewStatus(score);
    let visible = scoreToVisible(score);

    if (opts?.identityConcords === false && review_status === "validated") {
        review_status = "pending";
        visible = false;
    }

    return {
        score,
        tiers_matched,
        canonical_ean,
        canonical_name,
        review_status,
        visible,
    };
}
