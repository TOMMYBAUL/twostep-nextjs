import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_SEO } from "@/lib/categories";

const BASE_URL = "https://www.twostep.fr";

const SUPPORTED_CITIES: Record<string, { name: string; available: boolean }> = {
    paris: { name: "Paris", available: false },
    lyon: { name: "Lyon", available: false },
    bordeaux: { name: "Bordeaux", available: false },
    montpellier: { name: "Montpellier", available: false },
    marseille: { name: "Marseille", available: false },
    nantes: { name: "Nantes", available: false },
    lille: { name: "Lille", available: false },
    strasbourg: { name: "Strasbourg", available: false },
    rennes: { name: "Rennes", available: false },
    nice: { name: "Nice", available: false },
};

interface Props {
    params: Promise<{ city: string; category: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { city, category } = await params;
    const cityInfo = SUPPORTED_CITIES[city];
    const catTitle = CATEGORY_SEO[category]?.title;
    if (!cityInfo || !catTitle) return {};

    return {
        title: `${catTitle} à ${cityInfo.name} — Two-Step`,
        description: `Découvrez les boutiques ${catTitle.toLowerCase()} à ${cityInfo.name}. Two-Step arrive bientôt dans votre ville.`,
        alternates: { canonical: `${BASE_URL}/${city}/${category}` },
    };
}

export default async function CityComingSoonPage({ params }: Props) {
    const { city, category } = await params;
    const cityInfo = SUPPORTED_CITIES[city];
    const catTitle = CATEGORY_SEO[category]?.title;
    if (!cityInfo || !catTitle) notFound();

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-primary px-6 text-center" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
            <div className="mx-auto max-w-sm">
                <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-secondary text-3xl">
                    <img src="/logo-icon.webp?v=2" alt="" className="size-10 rounded-lg" />
                </div>

                <h1 className="font-heading text-2xl font-bold uppercase text-primary">
                    {catTitle} à {cityInfo.name}
                </h1>

                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2">
                    <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-solid opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-brand-solid" />
                    </span>
                    <span className="text-sm font-medium text-brand-secondary">Arrive bientôt</span>
                </div>

                <p className="mt-6 text-sm leading-relaxed text-tertiary">
                    Two-Step se lance d'abord à Toulouse. {cityInfo.name} fait partie
                    des prochaines villes sur notre liste.
                </p>

                <div className="mt-8 flex flex-col gap-3">
                    <Link
                        href="/toulouse"
                        className="rounded-xl bg-brand-solid px-6 py-3 text-sm font-semibold text-white transition active:opacity-80"
                    >
                        Découvrir Toulouse
                    </Link>
                    <Link
                        href="/explore"
                        className="rounded-xl border border-secondary px-6 py-3 text-sm font-medium text-secondary transition active:opacity-80"
                    >
                        Retour à l'accueil
                    </Link>
                </div>

                {/* Other categories in this city */}
                <nav className="mt-12 border-t border-tertiary pt-6">
                    <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-quaternary">
                        Autres catégories à {cityInfo.name}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {Object.entries(CATEGORY_SEO)
                            .filter(([key]) => key !== category)
                            .slice(0, 8)
                            .map(([key, val]) => (
                                <Link
                                    key={key}
                                    href={`/${city}/${key}`}
                                    className="rounded-full bg-secondary px-3 py-1.5 text-xs text-tertiary transition hover:bg-secondary/80"
                                >
                                    {val.title}
                                </Link>
                            ))}
                    </div>
                </nav>
            </div>
        </div>
    );
}
