import crypto from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { isSpreadsheetFile } from "@/lib/parser";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";

type AdminClient = ReturnType<typeof createAdminClient>;

export const STOCK_FILE_MAX_SIZE = 10 * 1024 * 1024;
const LOCK_STALE_MS = 10 * 60_000;

/**
 * Résultat discriminé de l'ingestion d'UN fichier stock pour un marchand.
 * Chaque appelant (route HTTP machine, inbound-email) le mappe vers SA réponse,
 * mais la logique métier (dedup, verrou, parse, snapshot, statut) est UNIQUE.
 */
export type IngestStockFileResult =
    | { outcome: "empty" }
    | { outcome: "too_large" }
    | { outcome: "not_spreadsheet" }
    | { outcome: "unchanged" }
    | { outcome: "locked" }
    | { outcome: "no_products" }
    | { outcome: "no_exploitable"; triage: SnapshotResult["triage"] }
    | { outcome: "ingested"; status: "ok" | "partial" | "error"; result: SnapshotResult };

type SnapshotResult = Awaited<ReturnType<typeof ingestStockSnapshot>>;

/**
 * Cœur PARTAGÉ de l'ingestion d'un snapshot stock par fichier — extrait de la
 * route HTTP `/api/ingest/stock` pour être réutilisé tel quel par l'inbound-email
 * (canal `stock-{slug}@…`). Invariants conservés à l'identique :
 *
 * - **Idempotence** : fichier identique au dernier (hash) → no-op (`unchanged`),
 *   on touche juste `last_used_at` — un export inchangé poussé toutes les 15 min
 *   ne retraite pas le catalogue.
 * - **Verrou anti-concurrence** par marchand (UPDATE conditionnel atomique, stale
 *   10 min) → un seul push à la fois (cron qui chevauche, retry, double email).
 * - **REPLACE + reconcile** : un fichier = snapshot complet, les articles vendus
 *   absents sont décrémentés (garde-fou anti-partiel dans `ingestStockSnapshot`).
 * - **Heartbeat / fraîcheur** : `ingest_credentials.last_used_at/last_rows/
 *   last_status/last_file_hash` reflètent le réel — `last_file_hash` n'est posé
 *   QUE si le push a abouti (un fichier en erreur reste re-poussable après
 *   correction). C'est ce que lit la détection de feed périmé.
 *
 * NB : l'appelant a déjà résolu `merchantId` (par jeton HTTP ou par slug email) et
 * fourni le buffer. Ne lève pas pour les cas métier (retourne un `outcome`) ; ne
 * relâche le verrou QUE s'il a été pris ici.
 */
export async function ingestStockFileForMerchant(
    admin: AdminClient,
    merchantId: string,
    buffer: Buffer,
    filename: string,
): Promise<IngestStockFileResult> {
    if (buffer.length === 0) return { outcome: "empty" };
    if (buffer.length > STOCK_FILE_MAX_SIZE) return { outcome: "too_large" };
    // Canal machine/fichier : on n'accepte QUE des tableurs (jamais de PDF → pas d'appel LLM ici).
    if (!isSpreadsheetFile(filename)) return { outcome: "not_spreadsheet" };

    // Idempotence : même fichier que le dernier push abouti → no-op immédiat.
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const { data: cred } = await admin
        .from("ingest_credentials")
        .select("last_file_hash")
        .eq("merchant_id", merchantId)
        .maybeSingle();
    if (cred?.last_file_hash === fileHash) {
        await admin
            .from("ingest_credentials")
            .update({ last_used_at: new Date().toISOString(), last_status: "ok" })
            .eq("merchant_id", merchantId);
        return { outcome: "unchanged" };
    }

    // Verrou : UPDATE conditionnel atomique ; 0 ligne = un autre push tient le verrou.
    const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();
    const { data: lockRows } = await admin
        .from("ingest_credentials")
        .update({ ingesting_since: new Date().toISOString() })
        .eq("merchant_id", merchantId)
        .or(`ingesting_since.is.null,ingesting_since.lt.${staleBefore}`)
        .select("merchant_id");
    if (!lockRows || lockRows.length === 0) return { outcome: "locked" };

    try {
        const parsed = parseStockFile(buffer);
        if (parsed.items.length === 0) {
            await admin
                .from("ingest_credentials")
                .update({ last_used_at: new Date().toISOString(), last_rows: 0, last_status: "error" })
                .eq("merchant_id", merchantId);
            return { outcome: "no_products" };
        }

        // reconcile: true → snapshot complet, on décrémente les vendus absents du fichier.
        const result = await ingestStockSnapshot(merchantId, parsed.items, admin, { reconcile: true });

        // Aucune ligne exploitable (ni GTIN valide ni SKU) → échec explicite, pas un faux succès.
        const exploitable = result.triage.gtin_lines + result.triage.sku_lines;
        if (exploitable === 0) {
            await admin
                .from("ingest_credentials")
                .update({ last_used_at: new Date().toISOString(), last_rows: result.total_items, last_status: "error" })
                .eq("merchant_id", merchantId);
            return { outcome: "no_exploitable", triage: result.triage };
        }

        const status: "ok" | "partial" | "error" =
            result.reconcile_skipped || result.errors.length > 0 || result.triage.rejected_lines > 0
                ? result.stock_replaced > 0
                    ? "partial"
                    : "error"
                : "ok";

        // last_file_hash uniquement si abouti → un fichier en erreur reste re-poussable.
        await admin
            .from("ingest_credentials")
            .update({
                last_used_at: new Date().toISOString(),
                last_rows: result.total_items,
                last_status: status,
                last_file_hash: fileHash,
            })
            .eq("merchant_id", merchantId);

        return { outcome: "ingested", status, result };
    } finally {
        // Libération du verrou quoi qu'il arrive (succès, retour métier, exception).
        await admin
            .from("ingest_credentials")
            .update({ ingesting_since: null })
            .eq("merchant_id", merchantId);
    }
}
