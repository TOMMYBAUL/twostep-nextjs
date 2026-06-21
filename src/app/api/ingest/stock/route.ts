import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestStockFileForMerchant } from "@/lib/ingest/ingest-stock-file";
import { resolveIngestToken } from "@/lib/ingest/token";
import { rateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/error";

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
 * pousser le même fichier toutes les 15 min est le mode nominal. La logique
 * métier (dedup, verrou, parse, snapshot, statut) vit dans le cœur partagé
 * `ingestStockFileForMerchant` (réutilisé par l'inbound-email `stock-{slug}@…`).
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

        const outcome = await ingestStockFileForMerchant(admin, merchantId, buffer, filename);

        switch (outcome.outcome) {
            case "empty":
                return NextResponse.json({ error: "Empty file" }, { status: 400 });
            case "too_large":
                return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
            case "not_spreadsheet":
                return NextResponse.json({ error: "Only CSV/XLSX accepted on this endpoint" }, { status: 415 });
            case "unchanged":
                return NextResponse.json({ ok: true, status: "unchanged" }, { status: 200 });
            case "locked":
                return NextResponse.json({ error: "Ingestion already in progress for this merchant" }, { status: 429 });
            case "no_products":
                return NextResponse.json({ error: "No products detected in file" }, { status: 400 });
            case "no_exploitable":
                return NextResponse.json(
                    {
                        error: "No exploitable lines: every row needs a valid GTIN barcode or a SKU (name alone is not an identity)",
                        triage: outcome.triage,
                    },
                    { status: 422 },
                );
            case "ingested":
                return NextResponse.json({ ok: true, status: outcome.status, ...outcome.result }, { status: 200 });
        }
    } catch (e) {
        captureError(e, { route: "ingest/stock" });
        return NextResponse.json(
            { error: `Ingest failed: ${e instanceof Error ? e.message : "unknown"}` },
            { status: 500 },
        );
    }
}
