import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvoice } from "@/lib/parser";
import { captureError } from "@/lib/error";

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "twostep.fr";
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";

const ACCEPTED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xls", ".csv"]);

function getExtension(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function verifyWebhookSignature(body: string, signature: string): boolean {
    if (!WEBHOOK_SECRET) return false; // Never skip — reject if secret not configured
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    if (signature.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
        return false;
    }
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    // Verify Resend webhook signature
    const signature = request.headers.get("resend-signature") ?? "";
    if (!WEBHOOK_SECRET || !verifyWebhookSignature(rawBody, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Resend inbound webhook sends { type: "email.received", data: { ... } }
    if (payload.type !== "email.received") {
        return NextResponse.json({ ok: true });
    }

    const emailData = payload.data;
    const emailId = emailData.id;
    const from = Array.isArray(emailData.from)
        ? (emailData.from[0]?.email ?? emailData.from[0] ?? "unknown")
        : (emailData.from ?? "unknown");
    const toList: string[] = Array.isArray(emailData.to)
        ? emailData.to.map((t: { email?: string } | string) => typeof t === "string" ? t : t.email ?? "")
        : [emailData.to ?? ""];

    // Find which merchant this email is for
    const supabase = createAdminClient();
    let merchantId: string | null = null;

    for (const toAddr of toList) {
        const lower = toAddr.toLowerCase();
        if (!lower.endsWith(`@${INBOUND_DOMAIN}`)) continue;

        // Extract slug: "factures-dear-skin-abc12345@in.twostep.fr" → "dear-skin-abc12345"
        const prefix = lower.replace(`@${INBOUND_DOMAIN}`, "");
        const slug = prefix.replace(/^factures-/, "");

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("inbound_email_slug", slug)
            .maybeSingle();

        if (merchant) {
            merchantId = merchant.id;
            break;
        }
    }

    if (!merchantId) {
        return NextResponse.json({ ok: true, ignored: "no matching merchant" });
    }

    try {
        // Fetch full email with attachments via Resend API
        const resend = new Resend(process.env.RESEND_API_KEY);
        const emailRes = await resend.emails.get(emailId);
        const emailPayload = emailRes.data as unknown as { attachments?: { filename: string; content: string; content_type: string }[] } | null;
        const attachments = emailPayload?.attachments ?? [];

        // Filter for invoice file types
        const invoiceAttachments = attachments.filter(
            (att) => ACCEPTED_EXTENSIONS.has(getExtension(att.filename))
        );

        if (invoiceAttachments.length === 0) {
            return NextResponse.json({ ok: true, ignored: "no invoice attachments" });
        }

        let processed = 0;

        for (const att of invoiceAttachments) {
            const buffer = Buffer.from(att.content, "base64");

            // Dedup: hash file content
            const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
            const { data: existing } = await supabase
                .from("invoices")
                .select("id")
                .eq("merchant_id", merchantId)
                .eq("file_hash", fileHash)
                .maybeSingle();

            if (existing) continue;

            // Upload to storage (sanitize filename to prevent path traversal)
            const safeFilename = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
            const storagePath = `${merchantId}/${Date.now()}_${safeFilename}`;
            const { error: storageError } = await supabase.storage
                .from("invoices")
                .upload(storagePath, buffer, { contentType: att.content_type });

            if (storageError) {
                console.error("[inbound-email] Storage upload failed:", storageError);
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
                    merchant_id: merchantId,
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
                console.error("[inbound-email] Invoice insert failed:", insertError);
                continue;
            }

            // Parse the invoice (same pipeline as manual upload)
            try {
                const parsed = await parseInvoice(buffer, att.filename);

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
                            brand: item.brand,
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
                console.error("[inbound-email] Parse failed:", att.filename, parseError);
            }
        }

        return NextResponse.json({ ok: true, processed });
    } catch (e) {
        captureError(e, { route: "inbound-email", merchantId });
        return NextResponse.json({ error: "Processing error" }, { status: 500 });
    }
}
