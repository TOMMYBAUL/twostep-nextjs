import type { Merchant } from "@/lib/types";

export type NudgeContext = {
    merchant: Merchant;
    lastPhotoUploadAt: Date | null;
    lastPromoCreatedAt: Date | null;
    lastCloseOfDayAt: Date | null;
    totalProducts: number;
};

export type Nudge = {
    id: string;
    message: string;
    cta: string;
    href: string;
    /** Returns true if the nudge is applicable in this context */
    applies: (ctx: NudgeContext) => boolean;
};

function daysAgo(date: Date | null): number {
    if (!date) return Infinity;
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export const NUDGES: Nudge[] = [
    {
        id: "no-photo-this-week",
        message: "Pas de nouvelle photo cette semaine — une belle photo peut doubler les vues.",
        cta: "Ajouter une photo",
        href: "/dashboard/stock/mon-stock?filter=incomplete",
        applies: (ctx) => daysAgo(ctx.lastPhotoUploadAt) > 7,
    },
    {
        id: "no-promo-this-month",
        message: "Tu n'as pas lancé de promo ce mois-ci — c'est un levier sous-utilisé.",
        cta: "Créer une promo",
        href: "/dashboard/promotions",
        applies: (ctx) => daysAgo(ctx.lastPromoCreatedAt) > 30 && ctx.totalProducts > 0,
    },
    {
        id: "close-of-day-streak-risk",
        message: "Ta dernière clôture remonte à 3 jours — garde ton streak actif.",
        cta: "Faire la clôture",
        href: "/dashboard/stock/cloture",
        applies: (ctx) => !ctx.merchant.pos_type && daysAgo(ctx.lastCloseOfDayAt) >= 3,
    },
    {
        id: "first-promo",
        message: "Première promo = premier déclic pour tes futurs clients.",
        cta: "Créer ma première promo",
        href: "/dashboard/promotions",
        applies: (ctx) => ctx.lastPromoCreatedAt === null && ctx.totalProducts >= 10,
    },
    {
        id: "check-competition",
        message: "Regarde ce que proposent les boutiques voisines — source d'inspiration.",
        cta: "Voir les alentours",
        href: "/explore",
        applies: () => true,
    },
    {
        id: "share-shop",
        message: "Partage le lien de ta boutique Two-Step avec tes clients fidèles.",
        cta: "Copier le lien",
        href: "/dashboard/store",
        applies: () => true,
    },
    {
        id: "review-incoming-facture",
        message: "Profite d'un moment calme pour vérifier ton inbox factures.",
        cta: "Voir les factures",
        href: "/dashboard/stock/factures",
        applies: () => true,
    },
    {
        id: "check-achievements",
        message: "Tu as peut-être débloqué un nouveau trophée sans t'en rendre compte.",
        cta: "Voir mes trophées",
        href: "/dashboard/achievements",
        applies: () => true,
    },
];

/**
 * Selects a nudge among applicable candidates.
 * Strategy: specific/conditional nudges first, then fallback to generic ones.
 * Pseudo-random stable on the day (same nudge throughout the day for a given merchant).
 */
export function pickDailyNudge(ctx: NudgeContext, seed: Date = new Date()): Nudge | null {
    const candidates = NUDGES.filter((n) => n.applies(ctx));
    if (candidates.length === 0) return null;

    const genericIds = new Set(["check-competition", "share-shop", "review-incoming-facture", "check-achievements"]);
    const specific = candidates.filter((n) => !genericIds.has(n.id));
    const pool = specific.length > 0 ? specific : candidates;

    const dayStamp = seed.toISOString().slice(0, 10);
    const hash = Array.from(dayStamp).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return pool[hash % pool.length];
}
