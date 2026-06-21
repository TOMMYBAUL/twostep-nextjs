/**
 * Statut d'une facture après un parsing qui n'a PAS levé d'exception.
 *
 * Un parse peut réussir structurellement mais n'extraire AUCUNE ligne article
 * (PDF illisible par le LLM, scan d'un document qui n'est pas une facture,
 * en-tête de tableur non reconnu). Le marquer "parsed" est une **dérive
 * silencieuse** : le marchand croit que des produits ont été importés alors
 * que 0 l'a été — surtout sur le canal email (asynchrone, aucun retour UI).
 *
 * On le marque donc "failed" (valeur de statut déjà acceptée par la contrainte
 * CHECK de `invoices` — migration 003 — et mappée sur ux_status "refused" par
 * la 068). Aucune migration requise, échec rendu visible.
 */
export function invoiceStatusForParse(itemCount: number): "parsed" | "failed" {
    return itemCount > 0 ? "parsed" : "failed";
}
