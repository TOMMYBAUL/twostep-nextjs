import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailProvider } from "@/lib/email/gmail";
import { outlookProvider } from "@/lib/email/outlook";
import { captureError } from "@/lib/error";
import { imapProvider } from "@/lib/email/imap";
import { decrypt, encrypt } from "@/lib/email/encryption";
import { parseInvoice } from "@/lib/parser";
import type { IEmailProvider } from "@/lib/email/types";

const MIME_BY_EXT: Record<string, string> = {
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".csv": "text/csv",
};

/** Deterministic hash for deduplication: messageId + attachment filename */
function emailHash(messageId: string, filename: string): string {
    return crypto
        .createHash("sha256")
        .update(`${messageId}::${filename}`)
        .digest("hex");
}

const providers: Record<string, IEmailProvider> = {
    gmail: gmailProvider,
    outlook: outlookProvider,
    imap: imapProvider,
};

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: connections } = await supabase
        .from("email_connections")
        .select("*")
        .eq("status", "active");

    if (!connections?.length) {
        return NextResponse.json({ scanned: 0 });
    }

    // Keywords that indicate an invoice/order email (with attachment)
    const INVOICE_KEYWORDS = ["facture", "invoice", "commande", "bon de livraison", "order confirmation"];

    // Keywords that indicate a delivery confirmation email (no attachment needed)
    const DELIVERY_KEYWORDS = [
        "livré", "livre", "delivered", "livraison effectuée", "livraison effectuee",
        "remis au destinataire", "colis distribué", "colis distribue",
        "has been delivered", "successfully delivered", "package delivered",
        "shipment delivered", "votre colis a été livré",
    ];

    // Known carrier email domains
    const CARRIER_DOMAINS = [
        "laposte.fr", "chronopost.fr", "colissimo.fr",
        "ups.com", "dhl.com", "gls-group.com", "dpd.fr",
        "fedex.com", "tnt.com", "mondialrelay.fr",
    ];

    let totalInvoices = 0;
    let totalDeliveries = 0;

    for (const conn of connections) {
        const provider = providers[conn.provider];
        if (!provider) continue;

        try {
            let accessToken = decrypt(conn.access_token);
            if (conn.provider !== "imap" && conn.refresh_token) {
                const refreshToken = decrypt(conn.refresh_token);
                try {
                    const refreshed = await provider.refreshToken(refreshToken);
                    accessToken = refreshed.access_token;
                    await supabase
                        .from("email_connections")
                        .update({ access_token: encrypt(accessToken) })
                        .eq("merchant_id", conn.merchant_id);
                } catch (e) {
                    captureError(e, { route: "cron/scan-emails", phase: "token-refresh", merchantId: conn.merchant_id });
                    await supabase
                        .from("email_connections")
                        .update({ status: "expired" })
                        .eq("merchant_id", conn.merchant_id);
                    continue;
                }
            }

            const since = conn.last_sync_at ? new Date(conn.last_sync_at) : null;
            const emails = await provider.fetchInvoiceEmails(accessToken, since);

            // ── Phase A: Detect delivery confirmation emails ──
            for (const email of emails) {
                const text = `${email.subject} ${email.from}`.toLowerCase();
                const senderDomain = email.from.split("@").pop()?.toLowerCase() ?? "";

                const isFromCarrier = CARRIER_DOMAINS.some((d) => senderDomain.includes(d));
                const hasDeliveryKeyword = DELIVERY_KEYWORDS.some((kw) => text.includes(kw));

                if (isFromCarrier && hasDeliveryKeyword) {
                    // This looks like a delivery confirmation — activate all incoming stock
                    const { data: incoming } = await supabase
                        .from("stock_incoming")
                        .select("id, product_id, quantity")
                        .eq("status", "incoming")
                        .in("product_id",
                            (await supabase
                                .from("products")
                                .select("id")
                                .eq("merchant_id", conn.merchant_id)
                            ).data?.map((p: { id: string }) => p.id) ?? []
                        );

                    if (incoming?.length) {
                        for (const item of incoming) {
                            await supabase.rpc("update_stock_delta", {
                                p_product_id: item.product_id,
                                p_delta: item.quantity,
                            });

                            await supabase
                                .from("stock_incoming")
                                .update({ status: "received", received_at: new Date().toISOString() })
                                .eq("id", item.id);

                            await supabase.from("feed_events").insert({
                                merchant_id: conn.merchant_id,
                                product_id: item.product_id,
                                event_type: "restock",
                            });
                        }
                        totalDeliveries += incoming.length;
                    }
                }
            }

            // ── Phase B: Detect invoice emails (with attachments) ──
            for (const email of emails) {
                for (const attachment of email.attachments) {
                    const text = `${email.subject} ${email.from}`.toLowerCase();
                    const isLikelyInvoice = INVOICE_KEYWORDS.some((kw) => text.includes(kw));

                    if (!isLikelyInvoice) continue;

                    // Dedup: skip if this exact email+attachment was already processed
                    const hash = emailHash(email.messageId, attachment.filename);
                    const { data: existing } = await supabase
                        .from("invoices")
                        .select("id")
                        .eq("merchant_id", conn.merchant_id)
                        .eq("email_hash", hash)
                        .maybeSingle();

                    if (existing) continue;

                    const filename = `${conn.merchant_id}/${Date.now()}_${attachment.filename}`;
                    const ext = attachment.filename.slice(attachment.filename.lastIndexOf(".")).toLowerCase();
                    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
                    await supabase.storage
                        .from("invoices")
                        .upload(filename, attachment.content, {
                            contentType,
                        });

                    const { data: signedUrlData } = await supabase.storage
                        .from("invoices")
                        .createSignedUrl(filename, 60 * 60 * 24 * 7);
                    const fileUrl = signedUrlData?.signedUrl ?? filename;

                    const { data: invoice } = await supabase
                        .from("invoices")
                        .insert({
                            merchant_id: conn.merchant_id,
                            source: "email",
                            status: "extracting",
                            file_url: fileUrl,
                            sender_email: email.from,
                            received_at: email.date.toISOString(),
                            email_hash: hash,
                        })
                        .select()
                        .single();

                    if (!invoice) continue;

                    try {
                        const parsed = await parseInvoice(attachment.content, attachment.filename);

                        await supabase
                            .from("invoices")
                            .update({
                                status: "parsed",
                                supplier_name: parsed.supplier_name,
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
                                }))
                            );
                        }

                        totalInvoices++;
                    } catch (e) {
                        captureError(e, { route: "cron/scan-emails", phase: "invoice-parse", merchantId: conn.merchant_id });
                        await supabase
                            .from("invoices")
                            .update({ status: "failed" })
                            .eq("id", invoice.id);
                    }
                }
            }

            await supabase
                .from("email_connections")
                .update({ last_sync_at: new Date().toISOString() })
                .eq("merchant_id", conn.merchant_id);
        } catch (err) {
            console.error(`Error scanning emails for merchant ${conn.merchant_id}:`, err);
        }
    }

    return NextResponse.json({
        scanned: connections.length,
        invoices_found: totalInvoices,
        deliveries_confirmed: totalDeliveries,
    });
}
