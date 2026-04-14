import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvoice } from "@/lib/parser";
import { captureError } from "@/lib/error";
import { rateLimit } from "@/lib/rate-limit";

const ACCEPTED_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    "application/vnd.ms-excel", // xls
    "text/csv",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "invoices:upload", 5);
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
        const supplierName = formData.get("supplier_name") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!ACCEPTED_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: "Type non supporté. Formats acceptés : PDF, XLSX, XLS, CSV." },
                { status: 400 },
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "Fichier trop volumineux (max 10 Mo)." },
                { status: 400 },
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Verify magic bytes to prevent MIME spoofing
        const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
        const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04; // PK (ZIP/XLSX)
        const isCsv = file.type === "text/csv"; // CSV = text, no magic bytes check needed
        if (!isPdf && !isXlsx && !isCsv) {
            return NextResponse.json(
                { error: "Contenu du fichier invalide (magic bytes incorrects)." },
                { status: 400 },
            );
        }

        // Sanitise filename
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);

        // Dedup: hash file content to prevent duplicate imports
        const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
        const { data: existing } = await supabase
            .from("invoices")
            .select("id")
            .eq("merchant_id", merchant.id)
            .eq("file_hash", fileHash)
            .maybeSingle();

        if (existing) {
            return NextResponse.json(
                { error: "Ce fichier a déjà été importé." },
                { status: 409 },
            );
        }

        // Upload to Supabase storage (admin client bypasses RLS on storage)
        const storagePath = `${merchant.id}/${Date.now()}_${safeFilename}`;
        const adminStorage = createAdminClient();

        const { error: storageError } = await adminStorage.storage
            .from("invoices")
            .upload(storagePath, buffer, { contentType: file.type });

        if (storageError) {
            return NextResponse.json({ error: "Erreur d'upload du fichier." }, { status: 500 });
        }

        const { data: signedUrlData } = await adminStorage.storage
            .from("invoices")
            .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

        const fileUrl = signedUrlData?.signedUrl ?? storagePath;

        // Create invoice record
        const { data: invoice, error: insertError } = await supabase
            .from("invoices")
            .insert({
                merchant_id: merchant.id,
                source: "upload",
                status: "extracting",
                file_url: fileUrl,
                file_hash: fileHash,
                supplier_name: supplierName || null,
                received_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError || !invoice) {
            return NextResponse.json({ error: "Erreur de création de la facture." }, { status: 500 });
        }

        // Parse the invoice (same flow as email cron)
        try {
            const parsed = await parseInvoice(buffer, file.name);

            await supabase
                .from("invoices")
                .update({
                    status: "parsed",
                    supplier_name: parsed.supplier_name ?? supplierName ?? null,
                    parsed_at: new Date().toISOString(),
                })
                .eq("id", invoice.id);

            if (parsed.items.length > 0) {
                await supabase.from("invoice_items").insert(
                    parsed.items.map((item) => ({
                        invoice_id: invoice.id,
                        name: item.name,
                        quantity: item.quantity,
                        unit_price_ht: item.unit_price,
                        ean: item.ean,
                        sku: item.sku,
                        brand: item.brand,
                        status: "detected",
                    })),
                );
            }

            return NextResponse.json({
                id: invoice.id,
                status: "parsed",
                items_count: parsed.items.length,
                supplier_name: parsed.supplier_name ?? supplierName,
            }, { status: 201 });
        } catch (parseError) {
            await supabase
                .from("invoices")
                .update({ status: "failed" })
                .eq("id", invoice.id);

            return NextResponse.json({
                id: invoice.id,
                status: "failed",
                error: parseError instanceof Error ? parseError.message : "Parsing failed",
            }, { status: 201 });
        }
    } catch (e) {
        captureError(e, { route: "invoices/upload" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
