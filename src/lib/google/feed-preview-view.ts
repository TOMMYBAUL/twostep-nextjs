/**
 * Vue « shadow/preview » du feed Google LFP — deriver PUR (aucune I/O) qui transforme la réponse
 * brute de `GET /api/google/feed-preview` en modèle d'affichage testable, comme `dashboard-view.ts`
 * le fait pour `/api/google/stats`. La page (client) ne fait que fetch + rendu : toute la logique
 * de tri d'état (erreur / vide / preview) et les libellés FR des causes vivent ici, testables champ
 * par champ.
 *
 * Raison d'être (item onboarding pilote 6a.2) : montrer au marchand EXACTEMENT ce qui serait publié
 * sur Google AVANT de publier. L'API garantit déjà la parité honnête avec les 2 feeds live ; ce
 * deriver ne doit donc RIEN recalculer d'éligibilité — il présente, il ne juge pas.
 */
import type { FeedBlockReason, PublishabilitySummary } from "@/lib/google/feed-eligibility";

/**
 * Une offre qui SERAIT publiée sur Google (payload exact du feed, cf. `transformProductToGoogle`).
 * Redéclarée localement (mêmes champs) pour ne pas coupler la vue au module de transform.
 */
export interface FeedPreviewItem {
    offerId: string;
    gtin: string;
    title: string;
    brand?: string;
    price: { value: string; currency: string };
    /** Prix promo (émis uniquement si une promo active fait un vrai rabais). */
    salePrice?: { value: string; currency: string };
    /** Absent = tier GTIN-only (Google matche par code-barres, sans image). */
    imageLink?: string;
    availability: "in stock" | "out of stock";
}

/** Un produit qui NE serait PAS publié + ses causes (par produit). */
export interface BlockedPreviewProduct {
    id: string;
    name: string;
    ean: string | null;
    price: number | null;
    reasons: FeedBlockReason[];
}

/** Réponse brute de `GET /api/google/feed-preview` (succès). */
export interface FeedPreviewData {
    merchant_id: string;
    store_code: string;
    google_connected: boolean;
    gtin_only_tier: boolean;
    summary: PublishabilitySummary;
    would_publish: FeedPreviewItem[];
    blocked: BlockedPreviewProduct[];
}

export type FeedPreviewView =
    | { kind: "error" }
    /** Aucun produit publiable-candidat (catalogue vide / rien de visible+validé) → guidage import. */
    | { kind: "empty" }
    | {
          kind: "preview";
          storeCode: string;
          googleConnected: boolean;
          gtinOnlyTier: boolean;
          summary: PublishabilitySummary;
          wouldPublish: FeedPreviewItem[];
          blocked: BlockedPreviewProduct[];
      };

/**
 * Libellés FR des causes de blocage. Les codes (`FeedBlockReason`) sont la source stable ; ce mapping
 * est la SEULE traduction affichée — un consommateur ne casse pas quand le texte change (cf. commentaire
 * du type dans `feed-eligibility.ts`). Un code inconnu retombe sur lui-même (jamais d'écran vide).
 */
export const FEED_BLOCK_REASON_LABEL_FR: Record<FeedBlockReason, string> = {
    missing_ean: "Code-barres (EAN) manquant ou trop court",
    missing_price: "Prix manquant ou nul",
    missing_image: "Photo manquante",
};

export function feedBlockReasonLabel(reason: FeedBlockReason): string {
    return FEED_BLOCK_REASON_LABEL_FR[reason] ?? reason;
}

/**
 * Transforme le résultat du fetch en vue. `ok=false` OU `data=null` → « error » (on ne montre JAMAIS
 * un preview vide trompeur sur un blip : la même honnêteté que l'API, qui lève plutôt que de mentir
 * « rien à publier »). Sinon, si la population totale ET les deux listes sont vides → « empty »
 * (catalogue à importer). Sinon → « preview » avec les données telles quelles (l'API a déjà tranché
 * l'éligibilité ; on présente).
 */
export function deriveFeedPreviewView(load: { ok: boolean; data: FeedPreviewData | null }): FeedPreviewView {
    if (!load.ok || !load.data) return { kind: "error" };
    const d = load.data;

    const total = d.summary?.total ?? 0;
    if (total === 0 && d.would_publish.length === 0 && d.blocked.length === 0) {
        return { kind: "empty" };
    }

    return {
        kind: "preview",
        storeCode: d.store_code,
        googleConnected: d.google_connected,
        gtinOnlyTier: d.gtin_only_tier,
        summary: d.summary,
        wouldPublish: d.would_publish,
        blocked: d.blocked,
    };
}
