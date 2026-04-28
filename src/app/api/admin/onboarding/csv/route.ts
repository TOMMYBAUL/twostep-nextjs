import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
    }

    const file = form.get("file");
    const merchantId = form.get("merchantId");

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "missing_file" }, { status: 400 });
    }
    if (typeof merchantId !== "string" || merchantId.length === 0) {
        return NextResponse.json({ error: "missing_merchant_id" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
    });

    // Papa.parse retourne 2 catégories d'errors :
    // - "Quotes" / "Delimiter" : CSV vraiment cassé → reject
    // - "FieldMismatch" (TooManyFields / TooFewFields) : warnings, data utilisable → accept
    //   (cas réel : marchand exporte un CSV avec virgules françaises non-quotées
    //   dans un prix → ligne décalée mais on peut quand même staging la raw_row,
    //   l'admin corrigera au step enrich.)
    const fatalErrors = parsed.errors.filter(
        (e) => e.type === "Quotes" || e.type === "Delimiter",
    );
    const warnings = parsed.errors.filter((e) => e.type === "FieldMismatch");

    if (fatalErrors.length > 0) {
        return NextResponse.json(
            { error: "csv_parse_error", details: fatalErrors.slice(0, 5) },
            { status: 400 },
        );
    }
    if (parsed.data.length === 0) {
        return NextResponse.json({ error: "empty_csv" }, { status: 400 });
    }

    const admin = createAdminClient();
    const rows = parsed.data.map((row) => ({
        merchant_id: merchantId,
        raw_row: row,
    }));

    const { error } = await admin.from("import_staging").insert(rows);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        count: rows.length,
        warnings: warnings.length > 0 ? warnings.slice(0, 10) : undefined,
    });
}
