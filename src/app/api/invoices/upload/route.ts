import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseInvoice } from "@/lib/parser";

const ACCEPTED_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    "application/vnd.ms-excel", // xls
    "text/csv",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
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

        // Upload to Supabase storage
        const buffer = Buffer.from(await file.arrayBuffer());
        const storagePath = `${merchant.id}/${Date.now()}_${file.name}`;

        const { error: storageError } = await supabase.storage
            .from("invoices")
            .upload(storagePath, buffer, { contentType: file.type });

        if (storageError) {
            return NextResponse.json({ error: "Erreur d'upload du fichier." }, { status: 500 });
        }

        const { data: signedUrlData } = await supabase.storage
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
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
