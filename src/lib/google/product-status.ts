/**
 * Lecture du STATUT RÉEL des produits côté Google Merchant Center.
 *
 * Pourquoi : aujourd'hui le canal LFP POUSSE EN AVEUGLE. `google-feed` (Voie A)
 * compte un produit comme « pushed » dès que `productInputs:insert` renvoie 200.
 * Mais un 200 à l'insert ne garantit PAS l'acceptation : Google traite ensuite le
 * produit de façon asynchrone et peut le REFUSER (GTIN invalide, image trop petite,
 * violation de politique…). Résultat : un marchand croit son produit « sur Google »
 * alors qu'il est en réalité rejeté = le faux positif n°1 du north-star
 * (« affiché honnêtement, zéro faux positif »).
 *
 * Ce module lit le résultat du traitement via l'API Merchant
 * `products.v1beta` → `accounts/{account}/products` (chaque produit porte un
 * `productStatus` avec `destinationStatuses` + `itemLevelIssues`), et l'agrège en
 * un résumé exploitable (combien servis / en attente / rejetés, et pourquoi).
 *
 * Spec : https://developers.google.com/merchant/api/reference/rest/products_v1beta/accounts.products#ProductStatus
 * Severity enum : SEVERITY_UNSPECIFIED | NOT_IMPACTED | DEMOTED | DISAPPROVED.
 */
import { googleMerchantFetch } from "@/lib/google/merchant";

export type GoogleDestinationStatus = {
    reportingContext?: string;
    approvedCountries?: string[];
    pendingCountries?: string[];
    disapprovedCountries?: string[];
};

export type GoogleItemLevelIssue = {
    code?: string;
    severity?: string;
    resolution?: string;
    attribute?: string;
    reportingContext?: string;
    description?: string;
    detail?: string;
    documentation?: string;
    applicableCountries?: string[];
};

export type GoogleProductStatus = {
    destinationStatuses?: GoogleDestinationStatus[];
    itemLevelIssues?: GoogleItemLevelIssue[];
};

export type GoogleProcessedProduct = {
    name?: string;
    offerId?: string;
    productStatus?: GoogleProductStatus;
};

/** Verdict de service par produit, dérivé de `destinationStatuses`. */
export type ProductStatusVerdict = "disapproved" | "served" | "pending" | "unknown";

export type IssueAggregate = {
    code: string;
    severity: string;
    description: string;
    count: number;
};

export type ProductStatusSummary = {
    total: number;
    disapproved: number;
    served: number;
    pending: number;
    unknown: number;
    /** offerId (= notre product.id) des produits rejetés, pour traçabilité. */
    disapprovedOfferIds: string[];
    /** Causes agrégées (itemLevelIssues), triées par fréquence décroissante. */
    issues: IssueAggregate[];
};

/**
 * Classe un produit à partir de `destinationStatuses` — signal STABLE entre
 * versions d'API (contrairement aux libellés de severity). Un produit est :
 * - `disapproved` si AU MOINS une destination le rejette (disapprovedCountries) ;
 * - sinon `served` si au moins une destination l'approuve quelque part ;
 * - sinon `pending` s'il est en attente de traitement ;
 * - sinon `unknown` (aucune destination → produit pas encore traité / shape vide).
 * Le rejet prime : un produit rejeté même sur un seul pays est un faux positif
 * potentiel s'il est affiché « en stock sur Google » chez nous.
 */
export function classifyProductStatus(status: GoogleProductStatus | undefined): ProductStatusVerdict {
    const dests = status?.destinationStatuses ?? [];
    if (dests.length === 0) return "unknown";

    if (dests.some((d) => (d.disapprovedCountries?.length ?? 0) > 0)) return "disapproved";
    if (dests.some((d) => (d.approvedCountries?.length ?? 0) > 0)) return "served";
    if (dests.some((d) => (d.pendingCountries?.length ?? 0) > 0)) return "pending";
    return "unknown";
}

/**
 * Agrège une liste de produits traités en un résumé. Pur, défensif (tolère les
 * champs absents : l'API peut omettre `productStatus`, `itemLevelIssues`, etc.).
 */
export function summarizeProductStatuses(products: GoogleProcessedProduct[]): ProductStatusSummary {
    let disapproved = 0;
    let served = 0;
    let pending = 0;
    let unknown = 0;
    const disapprovedOfferIds: string[] = [];
    const issueMap = new Map<string, IssueAggregate>();

    for (const p of products) {
        switch (classifyProductStatus(p.productStatus)) {
            case "disapproved":
                disapproved++;
                if (p.offerId) disapprovedOfferIds.push(p.offerId);
                break;
            case "served":
                served++;
                break;
            case "pending":
                pending++;
                break;
            default:
                unknown++;
        }

        for (const issue of p.productStatus?.itemLevelIssues ?? []) {
            const code = issue.code ?? "unknown";
            const existing = issueMap.get(code);
            if (existing) {
                existing.count++;
            } else {
                issueMap.set(code, {
                    code,
                    severity: issue.severity ?? "SEVERITY_UNSPECIFIED",
                    description: issue.description ?? "",
                    count: 1,
                });
            }
        }
    }

    const issues = [...issueMap.values()].sort((a, b) => b.count - a.count);
    return { total: products.length, disapproved, served, pending, unknown, disapprovedOfferIds, issues };
}

/** Page size max conseillé par l'API Merchant pour products.list. */
const PAGE_SIZE = 250;
/** Borne anti-boucle (cf. LESSONS : un curseur qui se répète = run cloud qui hang). */
const MAX_PAGES_DEFAULT = 200; // 200 × 250 = 50 000 produits

type FetchPage = typeof googleMerchantFetch;

/**
 * Lit TOUS les produits traités d'un compte Google (paginé, borné). LÈVE sur
 * erreur dure de l'API (anti « stock fantôme » : un échec réseau ne doit jamais
 * être confondu avec « 0 produit rejeté »). Le caller attrape et signale.
 *
 * @param accessToken  jeton d'accès Google déjà rafraîchi (cf. getGoogleAccessToken)
 * @param googleMerchantId  id du compte Merchant Center
 * @param deps.fetchPage  injection pour les tests (défaut : googleMerchantFetch)
 */
export async function fetchProcessedProducts(
    accessToken: string,
    googleMerchantId: string,
    deps: { fetchPage?: FetchPage } = {},
): Promise<GoogleProcessedProduct[]> {
    const fetchPage = deps.fetchPage ?? googleMerchantFetch;
    const parent = `accounts/${googleMerchantId}`;
    const maxPages = Number(process.env.GOOGLE_STATUS_MAX_PAGES) || MAX_PAGES_DEFAULT;

    const out: GoogleProcessedProduct[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
        if (pages >= maxPages) {
            throw new Error(
                `fetchProcessedProducts: limite de ${maxPages} pages dépassée (compte ${googleMerchantId}) — boucle de pagination probable`,
            );
        }
        const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        if (pageToken) qs.set("pageToken", pageToken);

        const data = await fetchPage(`/products/v1beta/${parent}/products?${qs}`, accessToken);
        const products = (data.products as GoogleProcessedProduct[] | undefined) ?? [];
        out.push(...products);

        pageToken = (data.nextPageToken as string | undefined) || undefined;
        pages++;
    } while (pageToken);

    return out;
}
