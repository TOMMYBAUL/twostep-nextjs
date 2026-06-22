import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { transformProductToGoogle, filterEligibleProducts } from "@/lib/google/feed";
import { captureError } from "@/lib/error";

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: connections, error: connectionsErr } = await supabase
        .from("google_merchant_connections")
        .select("merchant_id, store_code");

    // Échec de lecture DB ≠ « aucun marchand connecté » : sans cette garde, un blip
    // DB faisait no-op SILENCIEUX pour TOUS les marchands (HTTP 200, aucun Sentry,
    // aucun statut) = tout le feed Google abandonné sans trace.
    if (connectionsErr) {
        captureError(connectionsErr, { cron: "google-feed", step: "load-connections" });
        return NextResponse.json({ error: "db_error", message: connectionsErr.message }, { status: 500 });
    }

    if (!connections || connections.length === 0) {
        return NextResponse.json({ processed: 0, message: "No Google-connected merchants" });
    }

    let totalPushed = 0;
    let errors = 0;

    for (const conn of connections) {
        try {
            const auth = await getGoogleAccessToken(conn.merchant_id);
            if (!auth) {
                // Token Google expiré/révoqué = feed mort SILENCIEUX pour le marchand.
                // On le rend visible (statut + Sentry) au lieu d'incrémenter un compteur.
                errors++;
                await supabase
                    .from("google_merchant_connections")
                    .update({ last_feed_status: "error", last_feed_error: "Google token expired or revoked — reconnect required" })
                    .eq("merchant_id", conn.merchant_id);
                captureError(new Error("Google token unavailable"), { cron: "google-feed", merchantId: conn.merchant_id });
                continue;
            }

            // GATE : ne pousser à Google QUE les produits réellement publiables
            // (validés, visibles, non archivés, non variantes). Sinon on expose des
            // produits non identifiés sur Google Shopping (faux positif public).
            const { data: products, error: productsErr } = await supabase
                .from("products")
                .select("id, name, canonical_name, description, brand, ean, price, photo_processed_url, photo_url, visible, stock(quantity)")
                .eq("merchant_id", conn.merchant_id)
                .eq("visible", true)
                .eq("review_status", "validated")
                .is("archived_at", null)
                .is("variant_of", null);

            // Échec de lecture DB ≠ « marchand sans produit » : un `continue` muet ici
            // laissait le feed du marchand SILENCIEUSEMENT périmé (aucun statut, aucun
            // Sentry). On route vers le catch externe (captureError + statut "error").
            if (productsErr) throw new Error(`products read failed: ${productsErr.message}`);
            // data null SANS error = état SDK inattendu : lever plutôt que skip muet
            // (sinon ce cas re-silencerait le feed du marchand si le SDK évoluait).
            if (!products) throw new Error("products null without error — unexpected SDK state");

            const eligible = filterEligibleProducts(products as any);
            const parent = `accounts/${auth.connection.google_merchant_id}`;

            let pushed = 0;
            for (const product of eligible) {
                try {
                    const googleProduct = transformProductToGoogle(product as any, conn.store_code);
                    await googleMerchantFetch(
                        `/products/v1beta/${parent}/productInputs:insert`,
                        auth.accessToken,
                        {
                            method: "POST",
                            body: JSON.stringify(googleProduct),
                        },
                    );
                    pushed++;
                } catch (err) {
                    captureError(err, {
                        merchantId: conn.merchant_id,
                        productId: product.id,
                        cron: "google-feed",
                    });
                }
            }

            // Statut honnête : "partial" si des produits éligibles ont échoué au push.
            const feedStatus = pushed === eligible.length ? "success" : "partial";
            await supabase
                .from("google_merchant_connections")
                .update({
                    products_pushed: pushed,
                    last_feed_at: new Date().toISOString(),
                    last_feed_status: feedStatus,
                    last_feed_error: feedStatus === "partial" ? `${eligible.length - pushed}/${eligible.length} produits non poussés` : null,
                })
                .eq("merchant_id", conn.merchant_id);

            totalPushed += pushed;
        } catch (err) {
            errors++;
            captureError(err, { merchantId: conn.merchant_id, cron: "google-feed" });

            await supabase
                .from("google_merchant_connections")
                .update({
                    last_feed_status: "error",
                    last_feed_error: err instanceof Error ? err.message : String(err),
                })
                .eq("merchant_id", conn.merchant_id);
        }
    }

    return NextResponse.json({
        merchants: connections.length,
        products_pushed: totalPushed,
        errors,
    });
}

export { POST as GET };
