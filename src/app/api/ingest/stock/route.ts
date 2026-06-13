import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSpreadsheetFile } from "@/lib/parser";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";
import { resolveIngestToken } from "@/lib/ingest/token";
import { rateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/error";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Push de snapshot stock "à la NearSt" — endpoint MACHINE, sans session.
 *
 * La caisse du marchand (ou un cron côté commerçant) pousse périodiquement un
 * fichier CSV/XLSX `{code-barres ; quantité ; prix}`. Authentification par jeton
 * unique (`Authorization: Bearer <token>` ou `?token=`). Aucune intégration API
 * propriétaire requise → fonctionne avec N'IMPORTE QUELLE caisse capable
 * d'exporter un fichier (y compris les caisses françaises à API fermée).
 *
 * Sémantique REPLACE : chaque push remplace l'état du stock. Idempotent —
 * pousser le même fichier toutes les 15 min est le mode nominal.
 */
export async function POST(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const authHeader = request.headers.get("authorization");
        const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
        const token = bearer ?? url.searchParams.get("token");

        if (!token) {
            return NextResponse.json({ error: "Missing ingest token" }, { status: 401 });
        }

        // Rate limit par jeton : un cron mal réglé ne doit pas marteler.
        const limited = await rateLimit(token, "ingest:stock", 12);
        if (limited) return limited;

        const admin = createAdminClient();
        const merchantId = await resolveIngestToken(token, admin);
        if (!merchantId) {
            return NextResponse.json({ error: "Invalid ingest token" }, { status: 401 });
        }

        // Lecture du fichier : multipart (champ "file") ou corps brut (HTTP PUT/POST direct).
        const contentType = request.headers.get("content-type") ?? "";
        let buffer: Buffer;
        let filename: string;

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file") as File | null;
            if (!file) return NextResponse.json({ error: "No file in form-data" }, { status: 400 });
            buffer = Buffer.from(await file.arrayBuffer());
            filename = file.name || "stock.csv";
        } else {
            buffer = Buffer.from(await request.arrayBuffer());
            filename =
                url.searchParams.get("filename") ??
                (contentType.includes("spreadsheet") || contentType.includes("ms-excel")
                    ? "stock.xlsx"
                    : "stock.csv");
        }

        if (buffer.length === 0) {
            return NextResponse.json({ error: "Empty file" }, { status: 400 });
        }
        if (buffer.length > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
        }
        // Endpoint machine : on n'accepte QUE des tableurs (pas de PDF → pas d'appel LLM).
        if (!isSpreadsheetFile(filename)) {
            return NextResponse.json(
                { error: "Only CSV/XLSX accepted on this endpoint" },
                { status: 415 },
            );
        }

        // Idempotence : fichier identique au dernier push (export inchangé, boutique
        // fermée) → no-op immédiat, on évite de retraiter tout le catalogue.
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
            return NextResponse.json({ ok: true, status: "unchanged" }, { status: 200 });
        }

        // Verrou anti-concurrence : un seul push à la fois par marchand (cron 15 min
        // qui chevauche, retry réseau). UPDATE conditionnel atomique ; 0 ligne = lock pris.
        const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
        const { data: lockRows } = await admin
            .from("ingest_credentials")
            .update({ ingesting_since: new Date().toISOString() })
            .eq("merchant_id", merchantId)
            .or(`ingesting_since.is.null,ingesting_since.lt.${staleBefore}`)
            .select("merchant_id");
        if (!lockRows || lockRows.length === 0) {
            return NextResponse.json({ error: "Ingestion already in progress for this merchant" }, { status: 429 });
        }

        try {
            const parsed = parseStockFile(buffer);
            if (parsed.items.length === 0) {
                await admin
                    .from("ingest_credentials")
                    .update({ last_used_at: new Date().toISOString(), last_rows: 0, last_status: "error" })
                    .eq("merchant_id", merchantId);
                return NextResponse.json({ error: "No products detected in file" }, { status: 400 });
            }

            // reconcile: true → un push token est un snapshot complet, on décrémente
            // les articles vendus absents du fichier (garde-fou anti-partiel intégré).
            const result = await ingestStockSnapshot(merchantId, parsed.items, admin, { reconcile: true });

            // Aucune ligne exploitable (ni GTIN valide ni SKU) → échec explicite.
            const exploitable = result.triage.gtin_lines + result.triage.sku_lines;
            if (exploitable === 0) {
                await admin
                    .from("ingest_credentials")
                    .update({ last_used_at: new Date().toISOString(), last_rows: result.total_items, last_status: "error" })
                    .eq("merchant_id", merchantId);
                return NextResponse.json(
                    {
                        error: "No exploitable lines: every row needs a valid GTIN barcode or a SKU (name alone is not an identity)",
                        triage: result.triage,
                    },
                    { status: 422 },
                );
            }

            const status =
                result.reconcile_skipped || result.errors.length > 0 || result.triage.rejected_lines > 0
                    ? result.stock_replaced > 0
                        ? "partial"
                        : "error"
                    : "ok";

            // last_file_hash stocké uniquement si le push a abouti (un fichier en
            // erreur doit pouvoir être re-poussé après correction).
            await admin
                .from("ingest_credentials")
                .update({
                    last_used_at: new Date().toISOString(),
                    last_rows: result.total_items,
                    last_status: status,
                    last_file_hash: fileHash,
                })
                .eq("merchant_id", merchantId);

            return NextResponse.json({ ok: true, status, ...result }, { status: 200 });
        } finally {
            // Libération du verrou, quoi qu'il arrive (succès, early-return, exception).
            await admin
                .from("ingest_credentials")
                .update({ ingesting_since: null })
                .eq("merchant_id", merchantId);
        }
    } catch (e) {
        captureError(e, { route: "ingest/stock" });
        return NextResponse.json(
            { error: `Ingest failed: ${e instanceof Error ? e.message : "unknown"}` },
            { status: 500 },
        );
    }
}
