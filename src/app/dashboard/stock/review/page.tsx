import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReviewTable } from "@/components/stock/review-table";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) redirect("/dashboard");

    // Fetch all products with a non-default review_status — i.e. all enriched products,
    // whatever bucket. The component handles client-side filtering by bucket.
    const { data: products } = await supabase
        .from("products")
        .select("id, name, canonical_name, original_name, photo_url, photo_processed_url, original_image_url, ean, brand, enrichment_source, enrichment_proposed_at, review_status")
        .eq("merchant_id", merchant.id)
        .not("enrichment_source", "is", null)
        .order("enrichment_proposed_at", { ascending: false })
        .limit(500);

    return (
        <div className="container-ts py-6">
            <PageHeader title="Validation" titleAccent="catalogue enrichi" />
            <p className="text-tertiary mb-6 -mt-4 text-sm">
                Vérifiez les produits proposés par notre enrichissement avant qu'ils n'apparaissent dans votre vitrine.
            </p>
            <ReviewTable products={products ?? []} />
        </div>
    );
}
