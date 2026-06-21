/**
 * Routage d'une adresse inbound `{prefix}@{domain}` vers son CANAL d'ingestion.
 *
 * - `stock-{slug}@…`    → canal "stock" (snapshot stock, pipeline NearSt).
 * - `factures-{slug}@…` → canal "invoice" (factures fournisseurs).
 * - `{slug}@…` (sans préfixe) → "invoice" (rétro-compat de l'existant).
 *
 * Pur (testable sans réseau) : décide le canal + extrait le slug marchand
 * (= `merchants.inbound_email_slug`). Retourne null si le domaine ne correspond
 * pas ou si le slug est vide.
 */
export type InboundChannel = "invoice" | "stock";

export function parseInboundAddress(
    toAddr: string,
    domain: string,
): { channel: InboundChannel; slug: string } | null {
    const lower = (toAddr ?? "").toLowerCase().trim();
    const suffix = `@${domain.toLowerCase()}`;
    if (!lower.endsWith(suffix)) return null;

    const prefix = lower.slice(0, lower.length - suffix.length);
    if (!prefix) return null;

    if (prefix.startsWith("stock-")) {
        const slug = prefix.slice("stock-".length);
        return slug ? { channel: "stock", slug } : null;
    }

    // Rétro-compat : préfixe `factures-` optionnel, tout le reste = facture.
    const slug = prefix.replace(/^factures-/, "");
    return slug ? { channel: "invoice", slug } : null;
}
