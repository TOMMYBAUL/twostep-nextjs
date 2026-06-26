import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/error";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReviewTable } from "@/components/stock/review-table";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: merchant, error: merchantError } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    // Un blip DB (≠ « pas de marchand ») ne doit pas filer en silence : `.single()` renvoie
    // PGRST116 quand 0 ligne (redirect légitime) ; toute AUTRE erreur est un défaut à tracer.
    if (merchantError && merchantError.code !== "PGRST116") {
        captureError(merchantError, { route: "dashboard/stock/review", phase: "load_merchant", userId: user.id });
    }
    if (!merchant) redirect("/dashboard");

    // Fetch all products with a non-default review_status — i.e. all enriched products,
    // whatever bucket. The component handles client-side filtering by bucket.
    const [{ data: products, error: productsError }, { data: posConn, error: posConnError }] = await Promise.all([
        supabase
            .from("products")
            .select("id, name, canonical_name, original_name, photo_url, photo_processed_url, original_image_url, ean, brand, pos_item_id, enrichment_source, enrichment_proposed_at, review_status")
            .eq("merchant_id", merchant.id)
            .not("enrichment_source", "is", null)
            .order("enrichment_proposed_at", { ascending: false })
            .limit(500),
        supabase
            .from("pos_connections")
            .select("provider")
            .eq("merchant_id", merchant.id)
            .order("last_sync_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
    ]);

    // Honnêteté north-star : un échec de lecture ≠ « rien à valider ». Sans cette garde,
    // un blip DB rendait `products=null` → EmptyState « Rien à valider », et les fiches
    // `pending_review` (invisibles en vitrine) ne seraient JAMAIS validées = catalogue
    // muet en silence. On le DIT (erreur + Réessayer), on ne le masque pas.
    if (productsError) {
        captureError(productsError, {
            route: "dashboard/stock/review",
            phase: "load_products",
            merchantId: merchant.id,
            // PostgrestError n'est pas une instance d'Error → String() = "[object Object]" ;
            // on forwarde les champs structurés pour garder le diagnostic dans Sentry.
            db_code: productsError.code,
            db_message: productsError.message,
            db_details: productsError.details,
        });
    }
    // L'erreur du SELECT pos_connections est non bloquante (badge writeback cosmétique,
    // `posConn?.provider ?? null` = repli sûr) — mais on la TRACE quand même : un échec
    // persistant (RLS cassée) doit être visible en monitoring, pas silencieux.
    if (posConnError) {
        captureError(posConnError, {
            route: "dashboard/stock/review",
            phase: "load_pos_connection",
            merchantId: merchant.id,
            db_code: posConnError.code,
            db_message: posConnError.message,
        });
    }

    return (
        <div className="container-ts py-6">
            <PageHeader title="Validation" titleAccent="catalogue enrichi" />
            <p className="text-tertiary mb-6 -mt-4 text-sm">
                Vérifiez les produits proposés par notre enrichissement avant qu'ils n'apparaissent dans votre vitrine.
            </p>
            <ReviewTable products={products ?? []} posProvider={posConn?.provider ?? null} loadError={!!productsError} />
        </div>
    );
}
