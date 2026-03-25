"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MarkerPin01, ChevronRight } from "@untitledui/icons";
import { generateSlug } from "@/lib/slug";
import { HeartButton } from "../../components/heart-button";
import { StockBadge } from "../../components/stock-badge";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";

interface ProductDetail {
    id: string;
    name: string;
    description: string | null;
    price: number;
    photo_url: string | null;
    ean: string | null;
    brand: string | null;
    category: string | null;
    merchant_id: string;
    stock: { quantity: number }[];
    promotions: { sale_price: number; ends_at: string | null }[];
    merchants?: { name: string; address: string; city: string; photo_url: string | null };
}

export default function ProductDetailClient() {
    const { id } = useParams<{ id: string }>();

    const { data: product, isLoading } = useQuery<ProductDetail>({
        queryKey: ["product", id],
        queryFn: async () => {
            const res = await fetch(`/api/products/${id}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.product;
        },
    });

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const isFavorite = favoriteIds.has(id);

    const quantity = product?.stock?.[0]?.quantity ?? 0;
    const activePromo = product?.promotions?.find(
        (p) => !p.ends_at || new Date(p.ends_at) > new Date(),
    );
    const discount = activePromo ? Math.round(((product!.price - activePromo.sale_price) / product!.price) * 100) : 0;

    return (
        <div className="min-h-dvh bg-[var(--ts-cream)]">
            {/* Hero image — full width */}
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-white">
                {product?.photo_url ? (
                    <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        {isLoading ? null : (
                            <span className="text-6xl font-bold text-[var(--ts-brown-mid)]/10">
                                {product?.name?.charAt(0)}
                            </span>
                        )}
                    </div>
                )}

                {/* Back button */}
                <button
                    type="button"
                    onClick={() => window.history.back()}
                    className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-xl bg-white/80 shadow-sm backdrop-blur-sm"
                    style={{ marginTop: "env(safe-area-inset-top)" }}
                    aria-label="Retour"
                >
                    <ArrowLeft className="size-5 text-[var(--ts-brown)]" />
                </button>

                {/* Heart button */}
                <div className="absolute right-4 top-4" style={{ marginTop: "env(safe-area-inset-top)" }}>
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={() => {
                            if (isFavorite) remove.mutate(id);
                            else add.mutate(id);
                        }}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${product?.name ?? "produit"} des favoris`}
                        className="bg-white/80 shadow-sm backdrop-blur-sm"
                    />
                </div>

                {/* Sale tag */}
                {activePromo && (
                    <div className="absolute left-4 top-4 rounded-full bg-[var(--ts-red)] px-3 py-1 text-xs font-bold text-white shadow-sm" style={{ marginTop: "calc(env(safe-area-inset-top) + 48px)" }}>
                        -{discount}%
                    </div>
                )}

                {/* Stock badge — bottom left overlay */}
                <div className="absolute bottom-4 left-4">
                    <StockBadge quantity={quantity} size="md" className="bg-white/80 shadow-sm backdrop-blur-sm" />
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-3 p-5">
                    <div className="h-7 w-48 animate-pulse rounded-xl bg-white" />
                    <div className="h-5 w-24 animate-pulse rounded-xl bg-white" />
                </div>
            ) : product ? (
                <>
                    {/* Content */}
                    <div className="-mt-4 rounded-t-3xl bg-[var(--ts-cream)] px-5 pt-6 pb-32">
                        {/* Brand + Category */}
                        {(product.brand || product.category) && (
                            <div className="mb-2 flex items-center gap-2">
                                {product.brand && (
                                    <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--ts-brown-mid)]">
                                        {product.brand}
                                    </span>
                                )}
                                {product.category && (
                                    <span className="text-[11px] text-[var(--ts-brown-mid)]/40">
                                        {product.category}
                                    </span>
                                )}
                            </div>
                        )}

                        <h1 className="font-display text-xl font-bold text-[var(--ts-brown)]">{product.name}</h1>

                        {/* Price */}
                        <div className="mt-2 flex items-baseline gap-2">
                            {activePromo ? (
                                <>
                                    <span className="text-2xl font-bold text-[var(--ts-ochre)]">{activePromo.sale_price.toFixed(2)} €</span>
                                    <span className="text-sm text-[var(--ts-brown-mid)]/40 line-through">{product.price.toFixed(2)} €</span>
                                </>
                            ) : (
                                <span className="text-2xl font-bold text-[var(--ts-brown)]">{product.price?.toFixed(2)} €</span>
                            )}
                        </div>

                        {/* Merchant card */}
                        <Link
                            href={`/shop/${generateSlug(product.merchants?.name || "", product.merchant_id)}`}
                            className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm transition duration-150 active:scale-[0.98]"
                        >
                            <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl bg-[var(--ts-cream)]">
                                {product.merchants?.photo_url ? (
                                    <img src={product.merchants.photo_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-lg font-bold text-[var(--ts-ochre)]">
                                        {product.merchants?.name?.charAt(0) ?? "?"}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-[var(--ts-brown)]">
                                    {product.merchants?.name ?? "Voir la boutique"}
                                </p>
                                {product.merchants?.address && (
                                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--ts-brown-mid)]/50">
                                        <MarkerPin01 className="size-3" aria-hidden="true" />
                                        {product.merchants.address}, {product.merchants.city}
                                    </p>
                                )}
                            </div>
                            <ChevronRight className="size-4 text-[var(--ts-brown-mid)]/20" />
                        </Link>

                        {/* Description */}
                        {product.description && (
                            <div className="mt-5">
                                <h2 className="mb-2 text-sm font-semibold text-[var(--ts-brown)]">Description</h2>
                                <p className="text-sm leading-relaxed text-[var(--ts-brown-mid)]/70">{product.description}</p>
                            </div>
                        )}

                        {/* Details */}
                        {product.ean && (
                            <div className="mt-4 rounded-2xl bg-white p-4">
                                <p className="text-[11px] text-[var(--ts-brown-mid)]/40">EAN : {product.ean}</p>
                            </div>
                        )}
                    </div>

                    {/* Sticky CTA */}
                    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--ts-cream-dark)] bg-white/95 px-4 pb-4 pt-3 backdrop-blur-md" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
                        <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((product.merchants?.address ?? "") + ", " + (product.merchants?.city ?? ""))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ts-ochre)] py-3.5 text-sm font-bold text-white shadow-sm transition duration-150 active:opacity-90"
                        >
                            <MarkerPin01 className="size-5" />
                            Voir en boutique
                        </a>
                    </div>
                </>
            ) : null}
        </div>
    );
}
