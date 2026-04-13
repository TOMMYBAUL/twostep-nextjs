import crypto from "crypto";
import PostalMime from "postal-mime";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvoice } from "@/lib/parser";
import { captureError } from "@/lib/error";

const WEBHOOK_SECRET = process.env.CF_EMAIL_WEBHOOK_SECRET ?? "";
const ACCEPTED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xls", ".csv"]);

function getExtension(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export async function POST(request: NextRequest) {
    // Verify shared secret
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const to = request.headers.get("x-email-to") ?? "";
    const from = request.headers.get("x-email-from") ?? "";

    if (!to) {
        return NextResponse.json({ error: "Missing X-Email-To header" }, { status: 400 });
    }

    // Extract merchant slug from recipient: "factures-dear-skin@twostep.fr" → "dear-skin"
    const localPart = to.split("@")[0]?.toLowerCase() ?? "";
    if (!localPart.startsWith("factures-")) {
        return NextResponse.json({ ok: true, ignored: "not a factures- address" });
    }
    const slug = localPart.replace("factures-", "");

    // Find merchant
    const supabase = createAdminClient();
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("inbound_email_slug", slug)
        .maybeSingle();

    if (!merchant) {
        return NextResponse.json({ ok: true, ignored: "no matching merchant for slug: " + slug });
    }

    try {
        // Parse raw RFC822 email
        const rawBuffer = Buffer.from(await request.arrayBuffer());
        const parser = new PostalMime();
        const email = await parser.parse(rawBuffer);

        // Filter attachments for invoice file types
        const invoiceAttachments = (email.attachments ?? []).filter(
            (att) => att.filename && ACCEPTED_EXTENSIONS.has(getExtension(att.filename))
        );

        if (invoiceAttachments.length === 0) {
            return NextResponse.json({ ok: true, ignored: "no invoice attachments" });
        }

        let processed = 0;

        for (const att of invoiceAttachments) {
            const buffer = Buffer.from(att.content as ArrayBuffer);

            // Dedup: hash file content
            const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
            const { data: existing } = await supabase
                .from("invoices")
                .select("id")
                .eq("merchant_id", merchant.id)
                .eq("file_hash", fileHash)
                .maybeSingle();

            if (existing) continue;

            // Upload to storage
            const storagePath = `${merchant.id}/${Date.now()}_${att.filename}`;
            const { error: storageError } = await supabase.storage
                .from("invoices")
                .upload(storagePath, buffer, { contentType: att.mimeType ?? "application/octet-stream" });

            if (storageError) {
                console.error("[inbound-email-cf] Storage upload failed:", storageError);
                continue;
            }

            const { data: signedUrlData } = await supabase.storage
                .from("invoices")
                .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

            const fileUrl = signedUrlData?.signedUrl ?? storagePath;

            // Create invoice record
            const { data: invoice, error: insertError } = await supabase
                .from("invoices")
                .insert({
                    merchant_id: merchant.id,
                    source: "email",
                    status: "extracting",
                    file_url: fileUrl,
                    file_hash: fileHash,
                    sender_email: from,
                    supplier_name: null,
                    received_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (insertError || !invoice) {
                console.error("[inbound-email-cf] Invoice insert failed:", insertError);
                continue;
            }

            // Parse the invoice
            try {
                const parsed = await parseInvoice(buffer, att.filename!);

                await supabase
                    .from("invoices")
                    .update({
                        status: "parsed",
                        supplier_name: parsed.supplier_name ?? null,
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

                processed++;
            } catch (parseError) {
                await supabase
                    .from("invoices")
                    .update({ status: "failed" })
                    .eq("id", invoice.id);
                console.error("[inbound-email-cf] Parse failed:", att.filename, parseError);
            }
        }

        return NextResponse.json({ ok: true, processed });
    } catch (e) {
        captureError(e, { route: "inbound-email-cloudflare", merchantId: merchant.id });
        return NextResponse.json({ error: "Processing error" }, { status: 500 });
    }
}
