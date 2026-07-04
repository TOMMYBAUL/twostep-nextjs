import type { SupabaseClient } from "@supabase/supabase-js";

import { captureError } from "@/lib/error";

/**
 * P0-2 — Garantit qu'un marchand FRAÎCHEMENT CRÉÉ possède un `inbound_email_slug`.
 *
 * Contexte : le trigger DB `set_slug_on_insert` (012) ne pose que `merchants.slug` ;
 * la migration 057 n'a backfillé `inbound_email_slug` qu'une seule fois (one-shot).
 * Sans cette étape, tout marchand créé après la 057 a `inbound_email_slug = NULL`
 * → aucune adresse email-in (`factures-{slug}@…` / `stock-{slug}@…`), jamais :
 * `/api/email/inbound-address` renvoie `{address: null}` et le routage
 * `/api/inbound-email` ne peut pas résoudre ses emails.
 *
 * FORMAT (source : 057 + parseInboundAddress) : `inbound_email_slug` = la VALEUR de
 * `merchants.slug`, sans préfixe. Les préfixes `stock-` / `factures-` appartiennent
 * à l'ADRESSE (construite à l'affichage/au routage), pas à la colonne. `slug` étant
 * UNIQUE (012), la contrainte `merchants_inbound_email_slug_unique` (057) est
 * respectée par construction.
 *
 * Idempotent et non destructif : n'écrit QUE si la colonne est encore NULL
 * (`.is("inbound_email_slug", null)`) — ne peut jamais écraser une valeur existante
 * (une adresse déjà communiquée à un fournisseur ne doit JAMAIS changer en silence).
 *
 * Non-fatal : un échec ici ne doit pas casser la création du marchand (le signup
 * prime) — il est rendu VISIBLE (captureError) et la migration 108 (trigger +
 * backfill) referme le trou côté DB.
 */
export async function ensureInboundEmailSlug(
    supabase: SupabaseClient,
    merchantId: string,
    slug: string | null | undefined,
): Promise<boolean> {
    if (!merchantId || !slug) {
        // Le slug est NOT NULL en DB (012) : son absence ici = anomalie du chemin
        // d'insertion (ex. insert sans .select("slug")) → visible, jamais muet.
        captureError(new Error("ensureInboundEmailSlug: slug marchand absent, adresse email-in non posée"), {
            phase: "ensureInboundEmailSlug",
            merchantId: merchantId || null,
        });
        return false;
    }

    const { error } = await supabase
        .from("merchants")
        .update({ inbound_email_slug: slug })
        .eq("id", merchantId)
        .is("inbound_email_slug", null);

    if (error) {
        // PostgrestError n'est pas une instance d'Error → forwarder le diagnostic
        // DB dans le contexte (leçon E4 / review-view).
        captureError(error, {
            phase: "ensureInboundEmailSlug",
            merchantId,
            code: error.code,
            details: error.details,
        });
        return false;
    }

    return true;
}
