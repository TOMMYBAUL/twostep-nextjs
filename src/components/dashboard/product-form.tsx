"use client";

import { useRef, useState, type FormEvent } from "react";
import { ImagePlus } from "@untitledui/icons";

const CATEGORIES = [
    { value: "mode", label: "Mode" },
    { value: "chaussures", label: "Chaussures" },
    { value: "bijoux", label: "Bijoux" },
    { value: "beaute", label: "Beauté" },
    { value: "sport", label: "Sport" },
    { value: "deco", label: "Décoration" },
    { value: "epicerie", label: "Épicerie" },
    { value: "textile", label: "Textile" },
    { value: "cosmetique", label: "Cosmétique" },
    { value: "hygiene", label: "Hygiène" },
    { value: "autre", label: "Autre" },
];

interface ProductFormProps {
    initialValues?: {
        name: string;
        description: string;
        ean: string;
        category: string;
        price: string;
        initialQuantity: string;
        photoUrl?: string | null;
    };
    productId?: string;
    onSubmit: (values: {
        name: string;
        description: string;
        ean: string;
        category: string;
        price: number;
        initial_quantity: number;
    }) => Promise<void>;
    submitLabel: string;
    isLoading: boolean;
}

export function ProductForm({ initialValues, productId, onSubmit, submitLabel, isLoading }: ProductFormProps) {
    const [name, setName] = useState(initialValues?.name ?? "");
    const [description, setDescription] = useState(initialValues?.description ?? "");
    const [ean, setEan] = useState(initialValues?.ean ?? "");
    const [category, setCategory] = useState(initialValues?.category ?? "");
    const [price, setPrice] = useState(initialValues?.price ?? "");
    const [initialQuantity, setInitialQuantity] = useState(initialValues?.initialQuantity ?? "0");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [photoPreview, setPhotoPreview] = useState<string | null>(initialValues?.photoUrl ?? null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !productId) return;

        setPhotoPreview(URL.createObjectURL(file));
        setUploading(true);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("product_id", productId);
            const res = await fetch("/api/images/upload", { method: "POST", body: form });
            if (!res.ok) throw new Error("Upload failed");
            const data = await res.json();
            setPhotoPreview(data.photo_url);
        } catch {
            setErrors((prev) => ({ ...prev, photo: "Erreur lors de l'upload" }));
        } finally {
            setUploading(false);
        }
    };

    const validate = () => {
        const errs: Record<string, string> = {};
        if (!name.trim()) errs.name = "Le nom est requis";
        if (!price || isNaN(Number(price)) || Number(price) < 0) errs.price = "Le prix doit être >= 0";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        await onSubmit({
            name: name.trim(),
            description: description.trim(),
            ean: ean.trim(),
            category,
            price: Number(price),
            initial_quantity: Number(initialQuantity) || 0,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="animate-fade-up stagger-3 space-y-5 max-w-xl">
            {/* Photo */}
            {productId && (
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Photo du produit</label>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 transition hover:border-gray-300"
                        >
                            {photoPreview ? (
                                <img src={photoPreview} alt="Preview" className="size-full object-cover" />
                            ) : (
                                <ImagePlus className="size-6 text-gray-400" />
                            )}
                        </button>
                        <div className="text-xs text-gray-400">
                            {uploading ? (
                                <p className="font-medium text-[var(--ts-terracotta)]">Upload en cours...</p>
                            ) : (
                                <p>Cliquez pour ajouter une photo. Elle sera automatiquement détourée.</p>
                            )}
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoChange}
                    />
                    {errors.photo && <p className="mt-1 text-xs text-red-500">{errors.photo}</p>}
                </div>
            )}

            {/* Name */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nom du produit *</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="search-ts w-full"
                    placeholder="Ex: Croissant beurre AOP"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="search-ts w-full min-h-[80px] resize-y"
                    placeholder="Description optionnelle..."
                />
            </div>

            {/* EAN */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Code EAN</label>
                <input
                    type="text"
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                    className="search-ts w-full"
                    placeholder="Code-barres (optionnel)"
                />
            </div>

            {/* Category */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Catégorie</label>
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="search-ts w-full"
                >
                    <option value="">Sélectionner...</option>
                    {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
            </div>

            {/* Price + Quantity row */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Prix de vente (€) *</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="search-ts w-full"
                        placeholder="0.00"
                    />
                    {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price}</p>}
                </div>
                {!initialValues && (
                    <div className="flex-1">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Quantité initiale</label>
                        <input
                            type="number"
                            min="0"
                            value={initialQuantity}
                            onChange={(e) => setInitialQuantity(e.target.value)}
                            className="search-ts w-full"
                            placeholder="0"
                        />
                    </div>
                )}
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-ts" disabled={isLoading}>
                    {isLoading ? "..." : submitLabel}
                </button>
            </div>
        </form>
    );
}
