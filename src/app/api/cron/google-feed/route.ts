import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { transformProductToGoogle, filterEligibleProducts } from "@/lib/google/feed";
import { gtinOnlyTierEnabled } from "@/lib/google/feed-eligibility";
import { captureError } from "@/lib/error";
import { streamRows } from "@/lib/supabase/paginate";
import { processStreamWithinTimeBudget } from "@/lib/google/feed-push";

// Catalogue pilote multimarque = des MILLIERS de SKU poussés un par un (appel réseau
// séquentiel) → on réserve le budget maximal Fluid pour ce cron.
export const maxDuration = 300;

// Budget temps que la route s'impose, SOUS `maxDuration` : elle s'arrête PROPREMENT avant
// le kill brutal de Vercel (~30 s de marge pour écrire les statuts + répondre). Sans ça, un
// gros catalogue tue la fonction en plein vol → feed partiel + statut JAMAIS écrit = troncature
// SILENCIEUSE (le marchand reste sur le « success » du run précédent). Cf. feed-push.ts.
const TIME_BUDGET_MS = 270_000;

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const deadlineMs = Date.now() + TIME_BUDGET_MS;

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

    // Écriture de statut RENDUE NON SILENCIEUSE : un échec du `.update` (blip DB / RLS)
    // laissait sinon le marchand sur le statut du run PRÉCÉDENT (p. ex. "success") alors
    // que ce run a été partiel/interrompu = exactement le faux "success" que ce fix vise
    // à fermer, ré-introduit par le chemin d'écriture. On le rend visible (Sentry).
    const writeMerchantStatus = async (merchantId: string, payload: Record<string, unknown>) => {
        const { error: writeErr } = await supabase
            .from("google_merchant_connections")
            .update(payload)
            .eq("merchant_id", merchantId);
        if (writeErr) {
            captureError(writeErr, { cron: "google-feed", step: "write-status", merchantId });
        }
    };

    let totalPushed = 0;
    let errors = 0;
    let merchantsAttempted = 0;
    let budgetExhausted = false;

    for (const conn of connections) {
        // Plus de budget temps → on ne DÉMARRE pas un marchand qu'on ne pourra pas finir.
        // Les marchands non traités gardent leur statut du run précédent (non altéré) ; on
        // signale plus bas (Sentry) qu'ils n'ont pas été rafraîchis = jamais un faux « à jour ».
        if (Date.now() >= deadlineMs) {
            budgetExhausted = true;
            break;
        }
        merchantsAttempted++;

        // Compté DANS l'action → survit à un THROW de lecture au milieu du flux (streamRows
        // fail-loud sur une page ultérieure) : le catch peut alors écrire le nombre RÉELLEMENT
        // poussé ce run, jamais le `products_pushed` périmé du run précédent (diagnostic honnête).
        let pushedThisMerchant = 0;

        try {
            const auth = await getGoogleAccessToken(conn.merchant_id);
            if (!auth) {
                // Token Google expiré/révoqué = feed mort SILENCIEUX pour le marchand.
                // On le rend visible (statut + Sentry) au lieu d'incrémenter un compteur.
                errors++;
                await writeMerchantStatus(conn.merchant_id, {
                    last_feed_status: "error",
                    last_feed_error: "Google token expired or revoked — reconnect required",
                });
                captureError(new Error("Google token unavailable"), { cron: "google-feed", merchantId: conn.merchant_id });
                continue;
            }

            // GATE : ne pousser à Google QUE les produits réellement publiables
            // (validés, visibles, non archivés, non variantes). Sinon on expose des
            // produits non identifiés sur Google Shopping (faux positif public).
            //
            // STREAMING + PAGINÉ KEYSET (parité mémoire avec la Voie B XML) : un SELECT non borné
            // est tronqué à 1000 lignes par PostgREST (sans erreur) → un catalogue >1000
            // publierait un feed PARTIEL silencieux. `streamRows` lit page par page
            // (`.order("id")` + `.gt("id", curseur)` = pagination KEYSET, dérive-immune) et on
            // filtre + pousse chaque page À LA VOLÉE → UNE seule page réside en RAM à la fois,
            // jamais tout le catalogue (Deerskin = milliers de SKU) ni son sous-ensemble éligible.
            // NB : le streaming borne la MÉMOIRE, pas le TEMPS — un catalogue dont le push
            // dépasse le budget reste "partial" et se termine au run suivant (les pages
            // non poussées ne sont alors même pas lues).
            //
            // DÉRIVE OFFSET FERMÉE (keyset) : la lecture s'étale sur toute la durée du push
            // (~270 s) ; l'ancienne pagination OFFSET (`.range()`) laissait une écriture concurrente
            // (archivage / dé-publication) DÉCALER les pages suivantes → un produit-frontière sauté
            // (ou dupliqué). Le curseur keyset est une VALEUR d'`id` ancrée, pas une position → un
            // insert/delete ailleurs ne le décale plus. Fini le résidu LOW-MED de faux "success" par
            // saut de dérive ; appliqué de façon COHÉRENTE aux lectures produits (cf. `paginate.ts`).
            const parent = `accounts/${auth.connection.google_merchant_id}`;

            // `nowMs` capturé UNE fois pour tout le marchand (parité avec la Voie B qui capture
            // au niveau buildLfpXml) : sinon une promo expirant pendant la boucle serait émise
            // pour les 1ers produits et pas les derniers (incohérence intra-feed).
            const nowMs = Date.now();
            // Tier GTIN-only (flag) lu UNE fois → éligibilité cohérente sur toutes les pages.
            const allowMissingImage = gtinOnlyTierEnabled();

            const eligiblePages = (async function* () {
                for await (const page of streamRows(() =>
                    supabase
                        .from("products")
                        // `stock(quantity, source, source_ts, updated_at)` : colonnes REQUISES par la
                        // disponibilité honnête M5 (`feedAvailability`) — sans elles, tout partirait
                        // « out of stock » (défaut conservateur). Parité Voie B + feed-preview.
                        .select("id, name, canonical_name, description, brand, ean, price, photo_processed_url, photo_url, visible, stock(quantity, source, source_ts, updated_at), promotions(sale_price, starts_at, ends_at)")
                        .eq("merchant_id", conn.merchant_id)
                        .eq("visible", true)
                        .eq("review_status", "validated")
                        .is("archived_at", null)
                        .is("variant_of", null)
                        .order("id", { ascending: true }),
                )) {
                    yield filterEligibleProducts(page as any, allowMissingImage);
                }
            })();

            // Push borné au budget temps : on s'arrête PROPREMENT avant le kill Vercel.
            // `processStreamWithinTimeBudget` capture chaque échec par produit (Sentry) et
            // signale `interrupted` si le deadline a coupé avant la fin → statut honnête.
            // Une erreur de lecture DB à n'importe quelle page LÈVE (streamRows fail-loud) →
            // catch externe → statut "error" (jamais un feed silencieusement périmé).
            const pushResult = await processStreamWithinTimeBudget(
                eligiblePages,
                async (product: any) => {
                    try {
                        const googleProduct = transformProductToGoogle(product, conn.store_code, nowMs);
                        await googleMerchantFetch(
                            `/products/v1beta/${parent}/productInputs:insert`,
                            auth.accessToken,
                            {
                                method: "POST",
                                body: JSON.stringify(googleProduct),
                            },
                        );
                        pushedThisMerchant++;
                        return true;
                    } catch (err) {
                        captureError(err, {
                            merchantId: conn.merchant_id,
                            productId: product.id,
                            cron: "google-feed",
                        });
                        return false;
                    }
                },
                { now: Date.now, deadlineMs },
            );

            const pushed = pushResult.succeeded;

            // Statut honnête. Distinguer DEUX causes de "partial" (jamais un faux "success") :
            //  - interrompu par le budget temps (catalogue trop gros pour un run) ;
            //  - échecs de push API Google sur certains produits (pushed < attempted).
            // En streaming interrompu, le TOTAL éligible est INCONNU (pages restantes non lues)
            // → le message ne l'affiche pas. Quand NON interrompu, `attempted` == total éligible
            // (toutes les pages ont été lues) → `pushed < attempted` = échecs d'API Google.
            let feedStatus: "success" | "partial";
            let feedError: string | null;
            if (pushResult.interrupted) {
                feedStatus = "partial";
                feedError = `interrompu (budget temps Vercel) : ${pushed} produit(s) poussé(s) avant interruption — catalogue trop gros pour un run`;
                budgetExhausted = true;
            } else if (pushed < pushResult.attempted) {
                feedStatus = "partial";
                feedError = `${pushResult.attempted - pushed}/${pushResult.attempted} produits non poussés (échec API Google)`;
            } else {
                feedStatus = "success";
                feedError = null;
            }

            await writeMerchantStatus(conn.merchant_id, {
                products_pushed: pushed,
                last_feed_at: new Date().toISOString(),
                last_feed_status: feedStatus,
                last_feed_error: feedError,
            });

            totalPushed += pushed;

            // Budget épuisé en plein marchand → on ne démarre pas le suivant (il serait coupé
            // de la même façon). La garde en tête de boucle le rattraperait, mais on coupe ici
            // pour ne pas re-lire un catalogue qu'on ne pourra pas pousser.
            if (pushResult.interrupted) break;
        } catch (err) {
            errors++;
            captureError(err, { merchantId: conn.merchant_id, cron: "google-feed" });

            // Une lecture de page ULTÉRIEURE qui échoue (streamRows lève) peut arriver APRÈS que
            // des produits ont déjà été poussés à Google ce run (insert idempotent → re-complétés
            // au prochain run). On reporte le nombre réellement poussé, pas le stale du run passé.
            await writeMerchantStatus(conn.merchant_id, {
                products_pushed: pushedThisMerchant,
                last_feed_status: "error",
                last_feed_error: err instanceof Error ? err.message : String(err),
            });

            // Le résumé de réponse reflète les produits RÉELLEMENT poussés avant l'échec
            // (chemin succès et catch mutuellement exclusifs par marchand → jamais compté 2×).
            totalPushed += pushedThisMerchant;
        }
    }

    // Rendre VISIBLE (Sentry) TOUTE épuisement du budget temps — pas seulement quand des
    // marchands sont entièrement sautés. Le pilote cible est MONO-marchand (Deerskin) : une
    // interruption en plein push y laisse `merchantsAttempted === connections.length`, donc
    // l'ancien garde `< length` ne tirait AUCUN signal Sentry (seul le statut "partial" en DB).
    // Un budget épuisé = « catalogue trop gros pour un run → chunking requis » → toujours alerter.
    if (budgetExhausted) {
        const skipped = connections.length - merchantsAttempted;
        captureError(
            new Error(
                `google-feed: budget temps épuisé — feed potentiellement incomplet ce run (marchands traités ${merchantsAttempted}/${connections.length}, ${skipped} non démarré(s)) — catalogue trop gros pour un run, chunking requis`,
            ),
            { cron: "google-feed", step: "time-budget", merchantsAttempted, merchantsTotal: connections.length, merchantsSkipped: skipped },
        );
    }

    return NextResponse.json({
        merchants: connections.length,
        merchants_attempted: merchantsAttempted,
        products_pushed: totalPushed,
        errors,
        time_budget_exhausted: budgetExhausted,
    });
}

export { POST as GET };
