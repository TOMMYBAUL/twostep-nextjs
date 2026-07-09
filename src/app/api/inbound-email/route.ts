import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvoice } from "@/lib/parser";
import { invoiceStatusForParse } from "@/lib/parser/invoice-status";
import { parseInboundAddress, type InboundChannel } from "@/lib/ingest/inbound-address";
import { ingestStockFileForMerchant } from "@/lib/ingest/ingest-stock-file";
import { getOrCreateIngestToken } from "@/lib/ingest/token";
import { captureError } from "@/lib/error";

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "twostep.fr";
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";

const ACCEPTED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xls", ".csv"]);
// Canal stock : QUE des tableurs (pas de PDF → pas d'appel LLM sur ce chemin machine).
const STOCK_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

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

type EmailAttachment = { filename: string; content: string; content_type: string };

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

    // Find which merchant + CHANNEL this email is for.
    // Adresse : stock-{slug}@domain (stock) | factures-{slug}@domain (factures) | {slug}@domain (factures).
    const supabase = createAdminClient();
    let resolved: { merchantId: string; channel: InboundChannel } | null = null;
    let lookupError: unknown = null;

    for (const toAddr of toList) {
        const parsed = parseInboundAddress(toAddr, INBOUND_DOMAIN);
        if (!parsed) continue;

        const { data: merchant, error: merchantErr } = await supabase
            .from("merchants")
            .select("id")
            .eq("inbound_email_slug", parsed.slug)
            .maybeSingle();

        // Un échec DB (≠ slug inconnu) ne doit JAMAIS être confondu avec « aucun
        // marchand » : sinon un blip Supabase → merchant=null → 200 OK ci-dessous →
        // Resend ne réessaie jamais → l'email stock planifié est PERDU EN SILENCE
        // (feed figé, 0 Sentry, 0 statut) = perte silencieuse n°1 du north-star, exactement
        // le motif resolveWebhookProduct. On retient l'erreur et, si rien ne matche, on
        // remonte 500 (Resend retry) + Sentry au lieu d'avaler.
        if (merchantErr) {
            lookupError = merchantErr;
            continue;
        }

        if (merchant) {
            resolved = { merchantId: merchant.id, channel: parsed.channel };
            break;
        }
    }

    if (!resolved) {
        // Erreur DB rencontrée sans aucun match → distinguer de « slug inconnu » (spam,
        // qui doit rester un 200 bénin et ne PAS faire boucler Resend) : rendre VISIBLE +
        // faire réessayer, ne pas avaler l'éventuel email stock.
        if (lookupError) {
            captureError(lookupError, {
                route: "inbound-email",
                step: "resolve_merchant",
                to: toList.join(","),
            });
            return NextResponse.json({ error: "merchant lookup failed" }, { status: 500 });
        }
        return NextResponse.json({ ok: true, ignored: "no matching merchant" });
    }

    const { merchantId, channel } = resolved;

    try {
        // Fetch full email with attachments via Resend API (commun aux deux canaux).
        const resend = new Resend(process.env.RESEND_API_KEY);
        const emailRes = await resend.emails.get(emailId);
        // L'email EXISTE chez Resend (on vient d'en recevoir le webhook) ; si la
        // RÉCUPÉRATION de son contenu échoue (blip API), data=null → attachments=[]
        // → on conclurait à tort « pas de pièce jointe » et on DROPPERAIT un email
        // stock qui contenait pourtant son CSV (perte silencieuse n°1). On lève pour
        // que l'outer catch remonte 500 → Resend RÉESSAIE (au lieu de perdre le fichier).
        const emailErr = (emailRes as { error?: { message?: string } | null }).error;
        if (emailErr || !emailRes.data) {
            throw new Error(`resend.emails.get a échoué pour ${emailId}: ${emailErr?.message ?? "data nulle"}`);
        }
        const emailPayload = emailRes.data as unknown as { attachments?: EmailAttachment[] } | null;
        const attachments = emailPayload?.attachments ?? [];

        // ─── Canal STOCK : snapshot stock via le cœur partagé d'ingestion ───
        if (channel === "stock") {
            // Le verrou + heartbeat vivent dans ingest_credentials (token NOT NULL) ;
            // on garantit la ligne pour un marchand résolu par email (sinon le verrou
            // matcherait 0 ligne → stock jamais ingéré en silence).
            await getOrCreateIngestToken(merchantId, supabase);

            const stockAttachments = attachments.filter((att) => STOCK_EXTENSIONS.has(getExtension(att.filename)));
            if (stockAttachments.length === 0) {
                // Un email arrivé sur le canal stock mais sans tableur exploitable = potentiellement
                // une mise à jour perdue → la rendre VISIBLE (north-star), pas un silence.
                captureError(new Error("email stock sans pièce jointe tableur exploitable"), {
                    route: "inbound-email",
                    channel: "stock",
                    merchantId,
                });
                return NextResponse.json({ ok: true, ignored: "no stock spreadsheet attachment" });
            }
            // Contrat SNAPSHOT UNIQUE : chaque fichier est un snapshot complet (reconcile=true).
            // Traiter plusieurs fichiers en séquence ferait que le dernier RÉCONCILIE contre le
            // précédent et l'ANNULE en silence (mauvais stock, ok:true). On refuse de deviner :
            // alerte + aucune ingestion (le marchand renvoie un seul fichier).
            if (stockAttachments.length > 1) {
                captureError(new Error(`email stock multi-fichiers (${stockAttachments.length}) — snapshot unique attendu, ingestion ignorée`), {
                    route: "inbound-email",
                    channel: "stock",
                    merchantId,
                });
                return NextResponse.json({ ok: true, ignored: "multiple stock files; single snapshot expected" });
            }

            // Vérité source = date de l'email (l'export est généré juste avant
            // l'envoi) : un webhook Resend REJOUÉ des heures plus tard (500 + retry)
            // ne doit pas horodater le snapshot « maintenant » — il passerait devant
            // des ventes webhook plus fraîches (garde temporelle M4) et mentirait
            // sur la fraîcheur M5. Le champ `created_at` fait partie du schéma des
            // événements Resend ; son ABSENCE = dérive de schéma → SIGNALÉE (sinon le
            // canal email entier retomberait EN SILENCE sur l'heure de traitement et
            // la garde resterait inerte — finding revue SF). L'ingestion continue
            // (repli = comportement historique, jamais un email stock perdu pour ça).
            const emailCreatedAt = (emailData as { created_at?: string }).created_at ?? null;
            if (!emailCreatedAt) {
                captureError(new Error("email stock sans created_at (schéma Resend ?) — sourceTs = heure de traitement, garde temporelle inactive"), {
                    route: "inbound-email",
                    channel: "stock",
                    step: "source-ts-absent",
                    merchantId,
                });
            }
            const results: Array<{ file: string; outcome: string; status?: string }> = [];
            for (const att of stockAttachments) {
                const buffer = Buffer.from(att.content, "base64");
                const outcome = await ingestStockFileForMerchant(supabase, merchantId, buffer, att.filename, {
                    sourceTs: emailCreatedAt,
                });
                results.push({
                    file: att.filename,
                    outcome: outcome.outcome,
                    ...(outcome.outcome === "ingested" ? { status: outcome.status } : {}),
                });

                // Un fichier non ingéré (problème de données) doit être VISIBLE, pas perdu
                // en silence (north-star). "locked"/"unchanged" sont bénins/transitoires.
                if (
                    outcome.outcome !== "ingested" &&
                    outcome.outcome !== "unchanged" &&
                    outcome.outcome !== "locked"
                ) {
                    captureError(new Error(`stock email ingest non aboutie: ${outcome.outcome}`), {
                        route: "inbound-email",
                        channel: "stock",
                        merchantId,
                        file: att.filename,
                    });
                }
            }

            return NextResponse.json({ ok: true, channel: "stock", results });
        }

        // ─── Canal FACTURES (existant, inchangé) ───
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
                // Échec d'upload = pièce jointe non traitée → remonter à Sentry
                // (console.error seul est perdu en serverless).
                captureError(storageError, { route: "inbound-email", step: "storage_upload", merchantId });
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

                // 0 item extrait → "failed" (pas "parsed") : sinon le marchand
                // croit que des produits ont été importés alors qu'aucun ne l'a été.
                await supabase
                    .from("invoices")
                    .update({
                        status: invoiceStatusForParse(parsed.items.length),
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
