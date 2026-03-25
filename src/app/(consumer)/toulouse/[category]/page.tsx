import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarkerPin01 } from "@untitledui/icons";
import { notFound } from "next/navigation";

const BASE_URL = "https://www.twostep.fr";

const CATEGORIES: Record<string, { title: string; description: string; dbCategory: string }> = {
    boulangeries: { title: "Boulangeries", description: "Découvrez les meilleures boulangeries artisanales de Toulouse. Pain frais, viennoiseries et pâtisseries disponibles en boutique.", dbCategory: "Boulangerie" },
    fromageries: { title: "Fromageries", description: "Les fromageries artisanales de Toulouse. Fromages locaux et affinés, disponibles en boutique.", dbCategory: "Fromagerie" },
    epiceries: { title: "Épiceries", description: "Épiceries fines et de quartier à Toulouse. Produits locaux, bio et artisanaux.", dbCategory: "Épicerie" },
    cavistes: { title: "Cavistes", description: "Les meilleurs cavistes de Toulouse. Vins, spiritueux et conseils de passionnés.", dbCategory: "Caviste" },
    bouchers: { title: "Boucheries", description: "Boucheries artisanales de Toulouse. Viandes de qualité, circuit court.", dbCategory: "Boucherie" },
    poissonneries: { title: "Poissonneries", description: "Poissonneries de Toulouse. Poissons frais et fruits de mer.", dbCategory: "Poissonnerie" },
    patisseries: { title: "Pâtisseries", description: "Pâtisseries artisanales de Toulouse. Gâteaux, macarons et douceurs.", dbCategory: "Pâtisserie" },
    traiteurs: { title: "Traiteurs", description: "Traiteurs de Toulouse. Plats cuisinés, buffets et spécialités.", dbCategory: "Traiteur" },
    primeurs: { title: "Primeurs", description: "Primeurs de Toulouse. Fruits et légumes frais, de saison et locaux.", dbCategory: "Primeur" },
    chocolatiers: { title: "Chocolatiers", description: "Chocolatiers artisanaux de Toulouse. Chocolats fins et confiseries.", dbCategory: "Chocolatier" },
};

interface Props {
    params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
    return Object.keys(CATEGORIES).map((category) => ({ category }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { category } = await params;
    const cat = CATEGORIES[category];
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
    const cat = CATEGORIES[category];
    if (!cat) notFound();

    const supabase = createAdminClient();

    // Get merchants that have products in this category
    const { data: products } = await supabase
        .from("products")
        .select("merchant_id, merchants(id, name, address, city, photo_url, logo_url)")
        .ilike("category", `%${cat.dbCategory}%`)
        .limit(100);

    // Deduplicate merchants
    const seen = new Set<string>();
    const merchants = (products ?? [])
        .map((p: any) => p.merchants)
        .filter((m: any) => {
            if (!m || seen.has(m.id)) return false;
            seen.add(m.id);
            return m.city?.toLowerCase().includes("toulouse");
        });

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
            <div className="min-h-dvh bg-[#2C1A0E] px-4 pb-24" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <h1 className="font-display text-2xl font-bold text-[#F5EDD8]">
                    {cat.title} à Toulouse
                </h1>
                <p className="mt-2 text-sm text-[#F5EDD8]/60">
                    {cat.description}
                </p>

                {merchants.length === 0 ? (
                    <p className="mt-8 text-center text-sm text-[#F5EDD8]/40">
                        Aucun commerce trouvé dans cette catégorie pour le moment.
                    </p>
                ) : (
                    <div className="mt-6 space-y-3">
                        {merchants.map((merchant: any) => {
                            const logo = merchant.logo_url || merchant.photo_url;
                            return (
                                <Link
                                    key={merchant.id}
                                    href={`/shop/${merchant.id}`}
                                    className="flex items-center gap-3 rounded-2xl bg-[#3D2A1A] p-4 transition duration-150 active:bg-[#3D2A1A]/80"
                                >
                                    <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#2C1A0E]">
                                        {logo ? (
                                            <Image src={logo} alt="" fill className="object-cover" />
                                        ) : (
                                            <span className="text-lg font-bold text-[#C17B2F]">
                                                {merchant.name.charAt(0)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14px] font-semibold text-[#F5EDD8]">{merchant.name}</p>
                                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#F5EDD8]/50">
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
                <nav className="mt-12 border-t border-[#F5EDD8]/10 pt-6">
                    <h2 className="text-sm font-semibold text-[#F5EDD8]/60">Autres catégories à Toulouse</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(CATEGORIES)
                            .filter(([key]) => key !== category)
                            .map(([key, val]) => (
                                <Link
                                    key={key}
                                    href={`/toulouse/${key}`}
                                    className="rounded-full bg-[#3D2A1A] px-3 py-1.5 text-xs text-[#F5EDD8]/70 transition hover:bg-[#3D2A1A]/80"
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
