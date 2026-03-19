"use client";

import { useState, type FormEvent } from "react";

const CATEGORIES = ["Alimentation", "Cosmétique", "Hygiène", "Textile", "Décoration", "Autre"];

interface ProductFormProps {
    initialValues?: {
        name: string;
        description: string;
        ean: string;
        category: string;
        price: string;
        initialQuantity: string;
    };
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

export function ProductForm({ initialValues, onSubmit, submitLabel, isLoading }: ProductFormProps) {
    const [name, setName] = useState(initialValues?.name ?? "");
    const [description, setDescription] = useState(initialValues?.description ?? "");
    const [ean, setEan] = useState(initialValues?.ean ?? "");
    const [category, setCategory] = useState(initialValues?.category ?? "");
    const [price, setPrice] = useState(initialValues?.price ?? "");
    const [initialQuantity, setInitialQuantity] = useState(initialValues?.initialQuantity ?? "0");
    const [errors, setErrors] = useState<Record<string, string>>({});

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
                        <option key={c} value={c}>{c}</option>
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
