import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
    pos_bootstrap: "Sync POS",
    invoice: "Facture",
    csv_import: "Import CSV",
    scan: "Scan code-barres",
};

export default async function ReviewProductDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();
    if (!merchant) redirect("/dashboard");

    const { data: product } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("merchant_id", merchant.id)
        .single();

    if (!product) notFound();

    const proposedName = product.canonical_name ?? product.name;
    const proposedPhoto = product.photo_processed_url ?? product.photo_url;
    const originalName = product.original_name ?? product.name;
    const originalPhoto = product.original_image_url;

    return (
        <div className="container-ts py-6">
            <Link href="/dashboard/stock/review" className="text-brand-secondary mb-4 inline-block text-sm hover:underline">
                ← Retour à la liste
            </Link>

            <PageHeader title={proposedName} />
            {product.enrichment_source && (
                <p className="text-tertiary mb-6 -mt-4 text-sm">
                    Source : {SOURCE_LABELS[product.enrichment_source] ?? product.enrichment_source}
                </p>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                <section className="card-ts p-4">
                    <h3 className="text-tertiary mb-3 text-xs font-semibold uppercase tracking-wide">
                        Original (source)
                    </h3>
                    <div className="aspect-square w-full overflow-hidden rounded-md bg-secondary">
                        {originalPhoto && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={originalPhoto} alt="" className="size-full object-cover" />
                        )}
                    </div>
                    <dl className="mt-3 space-y-2 text-sm">
                        <Field label="Nom" value={originalName} />
                        <Field label="EAN" value={product.ean ?? "—"} mono />
                        <Field label="Marque" value={product.brand ?? "—"} />
                    </dl>
                </section>

                <section className="card-ts p-4">
                    <h3 className="text-brand-secondary mb-3 text-xs font-semibold uppercase tracking-wide">
                        Proposition Two-Step
                    </h3>
                    <div className="aspect-square w-full overflow-hidden rounded-md bg-secondary">
                        {proposedPhoto && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proposedPhoto} alt="" className="size-full object-cover" />
                        )}
                    </div>
                    <dl className="mt-3 space-y-2 text-sm">
                        <Field label="Nom" value={proposedName} highlight={originalName !== proposedName} />
                        <Field label="EAN" value={product.ean ?? "—"} mono />
                        <Field label="Marque" value={product.brand ?? "—"} />
                        <Field label="Catégorie" value={product.category ?? "—"} />
                    </dl>
                </section>
            </div>

            <div className="mt-6 flex gap-3">
                <ValidateButton id={product.id} disabled={product.review_status === "validated"} />
                <RejectButton id={product.id} disabled={product.review_status === "rejected"} />
            </div>
        </div>
    );
}

function Field({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
    return (
        <div className="flex justify-between gap-2">
            <dt className="text-tertiary shrink-0">{label}</dt>
            <dd className={`truncate text-right ${mono ? "font-mono text-xs" : ""} ${highlight ? "text-brand-secondary font-medium" : "text-primary"}`}>
                {value}
            </dd>
        </div>
    );
}

// Client-rendered action buttons (forms posting to the API)
function ValidateButton({ id, disabled }: { id: string; disabled: boolean }) {
    return (
        <form action={`/api/products/${id}/validate`} method="POST">
            <button type="submit" disabled={disabled} className="btn-ts disabled:opacity-50">
                Valider
            </button>
        </form>
    );
}

function RejectButton({ id, disabled }: { id: string; disabled: boolean }) {
    return (
        <form action={`/api/products/${id}/reject`} method="POST">
            <input type="hidden" name="restore_original" value="true" />
            <button
                type="submit"
                disabled={disabled}
                className="text-tertiary hover:text-error-primary px-4 py-2 text-sm disabled:opacity-50"
            >
                Rejeter (garder l'original)
            </button>
        </form>
    );
}
