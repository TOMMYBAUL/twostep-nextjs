import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin/guard";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user.email)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

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

    if (parsed.errors.length > 0) {
        return NextResponse.json(
            { error: "csv_parse_error", details: parsed.errors.slice(0, 5) },
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

    return NextResponse.json({ count: rows.length });
}
