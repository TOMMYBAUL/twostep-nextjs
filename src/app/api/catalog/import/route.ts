import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";
import { captureError } from "@/lib/error";
import { rateLimit } from "@/lib/rate-limit";

const ACCEPTED_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "text/plain",                  // Windows sometimes sends CSV as text/plain
    "application/octet-stream",    // fallback for unknown types
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Import d'un snapshot de catalogue (CSV/XLSX exporté de la caisse du marchand),
 * canal "glisser-déposer" du dashboard — même cœur que le push par jeton
 * (`/api/ingest/stock`) : `ingestStockSnapshot`, sémantique REPLACE + réconciliation.
 *
 * Workflow wizard en deux temps :
 *   1. `mode=preview` → parse + triage d'identité + simulation complète
 *      (créations/màj/passages à 0), AUCUNE écriture. Le marchand voit ce qui
 *      va se passer — y compris les lignes rejetées et pourquoi — et confirme.
 *   2. `mode=apply` (défaut) → ingestion réelle, enregistrée pour traçabilité.
 *
 * Règle d'identité (contrat NearSt) : GTIN valide ou SKU, jamais le nom seul.
 */
export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "catalog:import", 6);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();
        if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

        const mode = formData.get("mode") === "preview" ? "preview" : "apply";

        if (!ACCEPTED_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: "Type non supporté. Formats acceptés : CSV, XLSX, XLS." },
                { status: 400 },
            );
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

        // Dedup : bloquer le ré-import du fichier strictement identique (apply uniquement —
        // re-prévisualiser un fichier est toujours permis).
        const { data: existingImport } = await supabase
            .from("invoices")
            .select("id")
            .eq("merchant_id", merchant.id)
            .eq("file_hash", fileHash)
            .maybeSingle();

        if (mode === "apply" && existingImport) {
            return NextResponse.json({ error: "Ce fichier a déjà été importé." }, { status: 409 });
        }

        const parsed = parseStockFile(buffer);
        if (parsed.items.length === 0) {
            return NextResponse.json(
                { error: "Aucune ligne détectée. Vérifiez que le fichier contient des colonnes code-barres/référence, quantité, prix." },
                { status: 400 },
            );
        }

        const admin = createAdminClient();
        const result = await ingestStockSnapshot(merchant.id, parsed.items, admin, {
            reconcile: true,
            dryRun: mode === "preview",
        });

        const exploitable = result.triage.gtin_lines + result.triage.sku_lines;

        if (mode === "preview") {
            return NextResponse.json({
                preview: true,
                already_imported: !!existingImport,
                ...result,
            });
        }

        if (exploitable === 0) {
            return NextResponse.json(
                {
                    error: "Aucune ligne exploitable : chaque produit doit avoir un code-barres (EAN/GTIN) ou une référence (SKU). Le nom seul ne suffit pas.",
                    triage: result.triage,
                },
                { status: 422 },
            );
        }

        // Traçabilité de l'import appliqué
        await supabase.from("invoices").insert({
            merchant_id: merchant.id,
            source: "upload",
            status: "imported",
            file_hash: fileHash,
            supplier_name: "CATALOGUE IMPORT",
            received_at: new Date().toISOString(),
            parsed_at: new Date().toISOString(),
            validated_at: new Date().toISOString(),
        });

        return NextResponse.json({ catalog_import: true, ...result }, { status: 201 });
    } catch (e) {
        captureError(e, { route: "catalog/import" });
        console.error("[catalog/import] Error:", e);
        return NextResponse.json({ error: `Import failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 500 });
    }
}
