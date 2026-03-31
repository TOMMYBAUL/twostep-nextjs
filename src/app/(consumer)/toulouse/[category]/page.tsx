import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarkerPin01 } from "@untitledui/icons";
import { notFound } from "next/navigation";
import { CATEGORY_SEO } from "@/lib/categories";

const BASE_URL = "https://www.twostep.fr";

interface Props {
    params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { category } = await params;
    const cat = CATEGORY_SEO[category];
    if (!cat) return {};

    return {
        title: `${cat.title} à Toulouse`,
        description: cat.description,
        alternates: { canonical: `${BASE_URL}/toulouse/${category}` },
        openGraph: {
            title: `${cat.title} à Toulouse | Two-Step`,
            description: cat.description,
            url: `${BASE_URL}/toulouse/${category}`,
        },
    };
}

export default async function CategoryPage({ params }: Props) {
    const { category } = await params;
    const cat = CATEGORY_SEO[category];
    if (!cat) notFound();

    let merchants: any[] = [];
    try {
        const supabase = createAdminClient();
        const { data: products } = await supabase
            .from("products")
            .select("merchant_id, merchants(id, slug, name, address, city, photo_url, logo_url)")
            .ilike("category", `%${cat.dbCategory}%`)
            .limit(100);

        const seen = new Set<string>();
        merchants = (products ?? [])
            .map((p: any) => p.merchants)
            .filter((m: any) => {
                if (!m || seen.has(m.id)) return false;
                seen.add(m.id);
                return m.city?.toLowerCase().includes("toulouse");
            });
    } catch { /* graceful: show empty state if DB unavailable */ }

    const breadcrumbLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: BASE_URL },
            { "@type": "ListItem", position: 2, name: "Toulouse", item: `${BASE_URL}/toulouse` },
            { "@type": "ListItem", position: 3, name: cat.title, item: `${BASE_URL}/toulouse/${category}` },
        ],
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
            <div className="min-h-dvh bg-[#FFFFFF] px-4 pb-24" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <h1 className="font-heading text-2xl font-bold uppercase text-[var(--ts-text)]">
                    {cat.title} à Toulouse
                </h1>
                <p className="mt-2 text-sm text-[#1A1F36]/60">
                    {cat.description}
                </p>

                {merchants.length === 0 ? (
                    <p className="mt-8 text-center text-sm text-[#1A1F36]/40">
                        Aucun commerce trouvé dans cette catégorie pour le moment.
                    </p>
                ) : (
                    <div className="mt-6 space-y-3">
                        {merchants.map((merchant: any) => {
                            const logo = merchant.logo_url || merchant.photo_url;
                            return (
                                <Link
                                    key={merchant.id}
                                    href={`/shop/${merchant.slug}`}
                                    className="flex items-center gap-3 rounded-2xl bg-[#E2E5F0] p-4 transition duration-150 active:bg-[#E2E5F0]/80"
                                >
                                    <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FFFFFF]">
                                        {logo ? (
                                            <Image src={logo} alt="" fill className="object-cover" />
                                        ) : (
                                            <span className="text-lg font-bold text-[#4268FF]">
                                                {merchant.name.charAt(0)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-semibold text-[#1A1F36]">{merchant.name}</p>
                                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#1A1F36]/50">
                                            <MarkerPin01 className="size-3 shrink-0" aria-hidden="true" />
                                            {merchant.address}
                                        </p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}

                {/* Internal links for SEO */}
                <nav className="mt-12 border-t border-[#1A1F36]/10 pt-6">
                    <h2 className="text-sm font-semibold text-[#1A1F36]/60">Autres catégories à Toulouse</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(CATEGORY_SEO)
                            .filter(([key]) => key !== category)
                            .map(([key, val]) => (
                                <Link
                                    key={key}
                                    href={`/toulouse/${key}`}
                                    className="rounded-full bg-[#E2E5F0] px-3 py-1.5 text-xs text-[#1A1F36]/70 transition hover:bg-[#E2E5F0]/80"
                                >
                                    {val.title}
                                </Link>
                            ))}
                    </div>
                </nav>
            </div>
        </>
    );
}
