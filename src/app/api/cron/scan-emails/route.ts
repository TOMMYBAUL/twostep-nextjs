import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailProvider } from "@/lib/email/gmail";
import { outlookProvider } from "@/lib/email/outlook";
import { imapProvider } from "@/lib/email/imap";
import { decrypt } from "@/lib/email/encryption";
import { parseInvoice } from "@/lib/parser";
import type { IEmailProvider } from "@/lib/email/types";

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

    let totalInvoices = 0;

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
                        .update({ access_token: accessToken })
                        .eq("merchant_id", conn.merchant_id);
                } catch {
                    await supabase
                        .from("email_connections")
                        .update({ status: "expired" })
                        .eq("merchant_id", conn.merchant_id);
                    continue;
                }
            }

            const since = conn.last_sync_at ? new Date(conn.last_sync_at) : null;
            const emails = await provider.fetchInvoiceEmails(accessToken, since);

            for (const email of emails) {
                for (const attachment of email.attachments) {
                    const keywords = ["facture", "invoice", "commande", "bon de livraison"];
                    const text = `${email.subject} ${email.from}`.toLowerCase();
                    const isLikelyInvoice = keywords.some((kw) => text.includes(kw));

                    if (!isLikelyInvoice) continue;

                    const filename = `${conn.merchant_id}/${Date.now()}_${attachment.filename}`;
                    await supabase.storage
                        .from("invoices")
                        .upload(filename, attachment.content, {
                            contentType: "application/pdf",
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
                        })
                        .select()
                        .single();

                    if (!invoice) continue;

                    try {
                        const parsed = await parseInvoice(attachment.content);

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
                                    status: "detected",
                                }))
                            );
                        }

                        totalInvoices++;
                    } catch {
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

    return NextResponse.json({ scanned: connections.length, invoices_found: totalInvoices });
}
