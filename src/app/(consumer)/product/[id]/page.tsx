"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MarkerPin01 } from "@untitledui/icons";
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
}

export default function ProductDetailPage() {
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

    return (
        <div className="pb-4">
            <div className="relative aspect-square w-full overflow-hidden bg-tertiary">
                {product?.photo_url ? (
                    <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center text-2xl font-bold text-quaternary">
                        {isLoading ? "" : product?.name?.charAt(0)}
                    </div>
                )}
                <div className="absolute left-3 top-3">
                    <button
                        type="button"
                        onClick={() => window.history.back()}
                        className="flex size-8 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm"
                        aria-label="Retour"
                    >
                        <ArrowLeft className="size-4 text-primary" />
                    </button>
                </div>
                <div className="absolute right-3 top-3">
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={() => {
                            if (isFavorite) remove.mutate(id);
                            else add.mutate(id);
                        }}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${product?.name ?? "produit"} des favoris`}
                        className="bg-primary/80 backdrop-blur-sm"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-3 p-4">
                    <div className="h-6 w-48 animate-pulse rounded bg-secondary" />
                    <div className="h-5 w-24 animate-pulse rounded bg-secondary" />
                </div>
            ) : product ? (
                <div className="px-4 pt-4">
                    <h1 className="text-xl font-bold text-primary">{product.name}</h1>

                    <div className="mt-1 flex items-center gap-2">
                        {activePromo ? (
                            <>
                                <span className="text-lg font-bold text-[var(--ts-ochre)]">{activePromo.sale_price.toFixed(2)} €</span>
                                <span className="text-sm text-tertiary line-through">{product.price.toFixed(2)} €</span>
                            </>
                        ) : (
                            <span className="text-lg font-bold text-primary">{product.price?.toFixed(2)} €</span>
                        )}
                    </div>

                    <div className="mt-2">
                        <StockBadge quantity={quantity} />
                    </div>

                    <Link
                        href={`/shop/${product.merchant_id}`}
                        className="mt-4 flex items-center gap-3 rounded-xl border border-secondary p-3 transition duration-100 hover:shadow-sm"
                    >
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-primary">Voir la boutique</p>
                        </div>
                        <MarkerPin01 className="size-4 text-tertiary" aria-hidden="true" />
                    </Link>

                    {product.description && (
                        <p className="mt-4 text-sm text-secondary">{product.description}</p>
                    )}
                    <div className="mt-3 space-y-1 text-xs text-tertiary">
                        {product.brand && <p>Marque : {product.brand}</p>}
                        {product.category && <p>Catégorie : {product.category}</p>}
                        {product.ean && <p>EAN : {product.ean}</p>}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
