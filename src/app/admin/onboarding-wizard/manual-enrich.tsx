"use client";

import { useCallback, useEffect, useState } from "react";

interface StagingRow {
    id: number;
    raw_row: Record<string, unknown>;
    status: string;
    created_at: string;
}

interface ManualEnrichProps {
    merchantId: string;
}

interface CascadeSuggestion {
    suggestion: {
        name: string;
        brand: string | null;
        ean: string | null;
        category: string | null;
        photo_url: string | null;
        sku: string | null;
        description: string | null;
    };
    cascade: {
        score: number;
        tiers_matched: string[];
        review_status: "validated" | "pending" | "masked";
        visible_proposed: boolean;
    };
}

interface FormState {
    name: string;
    ean: string;
    brand: string;
    price: string; // garde en string pour input (€ avec décimales), convert au submit
    photo_url: string;
    channel: "online" | "in_store" | "multi";
    category: string;
    size: string;
    description: string;
    sku: string;
}

const EMPTY_FORM: FormState = {
    name: "",
    ean: "",
    brand: "",
    price: "",
    photo_url: "",
    channel: "in_store",
    category: "",
    size: "",
    description: "",
    sku: "",
};

/** Heuristique pré-remplissage form depuis la raw_row CSV (français + anglais). */
function prefillFromRawRow(raw: Record<string, unknown>): FormState {
    const get = (...keys: string[]): string => {
        for (const k of keys) {
            const direct = raw[k];
            if (typeof direct === "string" && direct.trim()) return direct.trim();
            if (typeof direct === "number") return String(direct);
            // case-insensitive fallback
            const found = Object.entries(raw).find(
                ([rawKey]) => rawKey.toLowerCase() === k.toLowerCase(),
            );
            if (found) {
                const v = found[1];
                if (typeof v === "string" && v.trim()) return v.trim();
                if (typeof v === "number") return String(v);
            }
        }
        return "";
    };

    const name = get("Désignation", "Designation", "Nom", "name", "title", "Titre", "Produit");
    const ean = get("Code-barres", "code-barres", "EAN", "ean", "GTIN", "gtin", "UPC", "Gencode");
    const brand = get("Marque", "marque", "Brand", "brand", "Fabricant");
    const priceRaw = get("Prix TTC", "Prix", "Price", "price", "PrixVente");
    let photo = get("Photo URL", "Photo", "photo_url", "Image", "image_url", "Image URL");
    // Fix Sprint 1.5 — symétrique à description : si le CSV est décalé,
    // "Photo URL" peut contenir un coloris ("Noir/Blanc") ou une taille.
    // On garde uniquement les vraies URLs http(s).
    if (photo && !/^https?:\/\//i.test(photo.trim())) {
        photo = "";
    }
    const category = get("Catégorie", "Categorie", "Category", "category", "Type");
    const size = get("Taille", "taille", "Size", "size", "Pointure", "Dimension");
    let description = get("Description", "description", "Notes", "Détails", "Details");
    // Fix Sprint 1.5 — si le CSV est décalé (prix non-quoté virgule française),
    // la "Description" peut contenir une URL photo. On filtre pour ne pas
    // polluer le textarea description avec une URL.
    if (description && /^https?:\/\//i.test(description.trim())) {
        description = "";
    }
    const sku = get("Référence", "Reference", "SKU", "sku", "Code", "Ref");

    // Convert price like "129,99" → "129.99" (NUMERIC en €, pas en cents)
    let price = "";
    if (priceRaw) {
        const normalized = priceRaw.replace(/\s+/g, "").replace(",", ".");
        const num = Number.parseFloat(normalized);
        if (Number.isFinite(num) && num > 0) {
            price = num.toFixed(2);
        }
    }

    return {
        ...EMPTY_FORM,
        name,
        ean,
        brand,
        price,
        photo_url: photo,
        category,
        size,
        description,
        sku,
    };
}

export function ManualEnrich({ merchantId }: ManualEnrichProps) {
    const [rows, setRows] = useState<StagingRow[]>([]);
    const [selected, setSelected] = useState<StagingRow | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastSuccess, setLastSuccess] = useState<string | null>(null);
    const [cascadeResult, setCascadeResult] = useState<CascadeSuggestion | null>(null);
    const [isCascading, setIsCascading] = useState(false);
    const [cascadeError, setCascadeError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!merchantId) {
            setRows([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/onboarding/queue?merchantId=${encodeURIComponent(merchantId)}&status=pending&limit=200`,
            );
            const json = (await res.json()) as { rows?: StagingRow[]; error?: string };
            if (!res.ok) {
                setError(json.error ?? `HTTP ${res.status}`);
                setRows([]);
            } else {
                setRows(json.rows ?? []);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "unknown_error");
        } finally {
            setIsLoading(false);
        }
    }, [merchantId]);

    useEffect(() => {
        void load();
    }, [load]);

    function selectRow(row: StagingRow): void {
        setSelected(row);
        setForm(prefillFromRawRow(row.raw_row));
        setError(null);
        setLastSuccess(null);
        setCascadeResult(null);
        setCascadeError(null);
    }

    async function runCascadeSuggest(): Promise<void> {
        if (!selected) return;
        setIsCascading(true);
        setCascadeError(null);
        setCascadeResult(null);
        try {
            const res = await fetch("/api/admin/onboarding/cascade-suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stagingId: selected.id }),
            });
            const json = (await res.json()) as
                | CascadeSuggestion
                | { error: string };
            if (!res.ok || !("suggestion" in json)) {
                setCascadeError(("error" in json ? json.error : null) ?? `HTTP ${res.status}`);
                return;
            }
            setCascadeResult(json);
        } catch (err) {
            setCascadeError(err instanceof Error ? err.message : "unknown_error");
        } finally {
            setIsCascading(false);
        }
    }

    function applyCascadeToForm(): void {
        if (!cascadeResult) return;
        const s = cascadeResult.suggestion;
        setForm((prev) => ({
            ...prev,
            name: s.name || prev.name,
            ean: s.ean || prev.ean,
            brand: s.brand || prev.brand,
            category: s.category || prev.category,
            photo_url: s.photo_url || prev.photo_url,
            sku: s.sku || prev.sku,
            description: s.description || prev.description,
            // size, price : pas touchés (cascade ne les fournit pas)
        }));
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
        e.preventDefault();
        if (!selected) return;

        const priceNum = Number.parseFloat(form.price.replace(",", "."));
        if (!Number.isFinite(priceNum) || priceNum <= 0) {
            setError("Prix doit être > 0 (en euros, ex: 129.99)");
            return;
        }
        if (!form.name.trim()) {
            setError("Nom obligatoire");
            return;
        }

        setError(null);
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/admin/onboarding/enrich", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stagingId: selected.id,
                    name: form.name.trim(),
                    ean: form.ean.trim() || undefined,
                    brand: form.brand.trim() || undefined,
                    price: priceNum,
                    photo_url: form.photo_url.trim() || undefined,
                    channel: form.channel,
                    category: form.category.trim() || undefined,
                    size: form.size.trim() || undefined,
                    description: form.description.trim() || undefined,
                    sku: form.sku.trim() || undefined,
                    // Score + tiers cascade (si run avant) — propagés au product
                    identification_score: cascadeResult?.cascade.score,
                    identification_tiers: cascadeResult?.cascade.tiers_matched,
                }),
            });
            const json = (await res.json()) as {
                product?: { id: string; name: string };
                error?: string;
            };
            if (!res.ok) {
                setError(json.error ?? `HTTP ${res.status}`);
                return;
            }
            setLastSuccess(
                `✅ Produit enrichi : ${json.product?.name} (${json.product?.id})`,
            );
            setSelected(null);
            setForm(EMPTY_FORM);
            await load(); // reload list (le row enrichi disparaît du filtre 'pending')
        } catch (err) {
            setError(err instanceof Error ? err.message : "unknown_error");
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!merchantId) {
        return (
            <p className="text-tertiary">
                Saisis un merchant_id en haut de la page pour voir les rows à enrichir.
            </p>
        );
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-primary">
                        Rows pending ({rows.length})
                    </h3>
                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={isLoading}
                        className="px-3 py-1 text-sm border border-secondary rounded hover:bg-secondary_hover"
                    >
                        {isLoading ? "Chargement…" : "Recharger"}
                    </button>
                </div>
                {error && !selected && (
                    <p className="text-error-primary text-sm mb-3">⚠️ {error}</p>
                )}
                {lastSuccess && (
                    <p className="text-success-primary text-sm mb-3">{lastSuccess}</p>
                )}
                {rows.length === 0 && !isLoading ? (
                    <p className="text-tertiary text-sm">Aucune ligne pending.</p>
                ) : (
                    <ul className="space-y-2 max-h-[600px] overflow-y-auto">
                        {rows.map((r) => {
                            const isSelected = selected?.id === r.id;
                            const previewName =
                                typeof r.raw_row["Désignation"] === "string"
                                    ? r.raw_row["Désignation"]
                                    : typeof r.raw_row["name"] === "string"
                                      ? r.raw_row["name"]
                                      : `Row #${r.id}`;
                            return (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => selectRow(r)}
                                        className={
                                            "w-full text-left px-3 py-2 border rounded text-sm " +
                                            (isSelected
                                                ? "border-brand bg-brand-secondary"
                                                : "border-secondary hover:bg-primary_hover")
                                        }
                                    >
                                        <div className="font-mono text-xs text-tertiary">
                                            #{r.id}
                                        </div>
                                        <div className="font-medium">
                                            {String(previewName).slice(0, 80)}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div>
                {!selected ? (
                    <p className="text-tertiary text-sm">
                        Sélectionne un row à gauche pour l'enrichir.
                    </p>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <h3 className="font-semibold text-primary">
                            Enrichir row #{selected.id}
                        </h3>
                        <details className="text-xs">
                            <summary className="cursor-pointer text-tertiary">
                                Raw CSV row
                            </summary>
                            <pre className="mt-2 bg-secondary p-2 rounded overflow-x-auto">
                                {JSON.stringify(selected.raw_row, null, 2)}
                            </pre>
                        </details>

                        {/* Section cascade auto */}
                        <div className="rounded border border-secondary p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-secondary">
                                    🔮 Cascade auto (Tier 1-4)
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void runCascadeSuggest()}
                                    disabled={isCascading}
                                    className="text-xs px-3 py-1 border border-brand rounded hover:bg-brand-secondary disabled:opacity-50"
                                >
                                    {isCascading ? "Cascade en cours…" : "Lancer la cascade"}
                                </button>
                            </div>

                            {cascadeError && (
                                <p className="text-error-primary text-xs">⚠️ {cascadeError}</p>
                            )}

                            {cascadeResult && (
                                <div className="space-y-2 text-xs">
                                    <CascadeScoreBadge
                                        score={cascadeResult.cascade.score}
                                        reviewStatus={cascadeResult.cascade.review_status}
                                    />
                                    {cascadeResult.cascade.tiers_matched.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {cascadeResult.cascade.tiers_matched.map((t) => (
                                                <span
                                                    key={t}
                                                    className="bg-brand-secondary text-brand-primary px-2 py-0.5 rounded font-mono"
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    ) : cascadeResult.suggestion.photo_url ||
                                      cascadeResult.suggestion.category ||
                                      cascadeResult.suggestion.description ? (
                                        <p className="text-tertiary">
                                            Aucun tier d'identification ne matche, mais des données auxiliaires ont été trouvées (photo Serper / catégorie / description Haiku). Vérifie ci-dessous.
                                        </p>
                                    ) : (
                                        <p className="text-tertiary">
                                            Aucun tier matché — cascade n'a rien trouvé. Remplir manuellement.
                                        </p>
                                    )}

                                    {/* Vignette photo si trouvée par cascade ou Serper */}
                                    {cascadeResult.suggestion.photo_url && (
                                        <div className="flex items-start gap-3 p-2 border border-secondary rounded">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={cascadeResult.suggestion.photo_url}
                                                alt="Photo cascade"
                                                className="w-20 h-20 object-cover rounded border border-secondary"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-tertiary mb-1">
                                                    📷 Photo trouvée (Serper Images + Haiku verify)
                                                </p>
                                                <a
                                                    href={cascadeResult.suggestion.photo_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-brand-secondary underline break-all"
                                                >
                                                    {cascadeResult.suggestion.photo_url}
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {/* Suggestions textuelles visibles */}
                                    {(cascadeResult.suggestion.name ||
                                        cascadeResult.suggestion.category ||
                                        cascadeResult.suggestion.description) && (
                                        <ul className="space-y-1 text-tertiary">
                                            {cascadeResult.suggestion.name && (
                                                <li>
                                                    <strong>Nom :</strong>{" "}
                                                    {cascadeResult.suggestion.name}
                                                </li>
                                            )}
                                            {cascadeResult.suggestion.category && (
                                                <li>
                                                    <strong>Catégorie :</strong>{" "}
                                                    {cascadeResult.suggestion.category}
                                                </li>
                                            )}
                                            {cascadeResult.suggestion.description && (
                                                <li>
                                                    <strong>Description :</strong>{" "}
                                                    {cascadeResult.suggestion.description}
                                                </li>
                                            )}
                                        </ul>
                                    )}

                                    <details>
                                        <summary className="cursor-pointer text-tertiary">
                                            JSON brut (debug)
                                        </summary>
                                        <pre className="mt-2 bg-secondary p-2 rounded overflow-x-auto">
                                            {JSON.stringify(cascadeResult.suggestion, null, 2)}
                                        </pre>
                                    </details>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={applyCascadeToForm}
                                            className="text-xs px-3 py-1 bg-brand-solid text-white rounded hover:bg-brand-solid_hover"
                                        >
                                            Appliquer tout au form
                                        </button>
                                        {cascadeResult.suggestion.photo_url && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        photo_url:
                                                            cascadeResult.suggestion.photo_url ?? "",
                                                    }))
                                                }
                                                className="text-xs px-3 py-1 border border-brand text-brand-primary rounded hover:bg-brand-secondary"
                                            >
                                                Photo seule
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <Field
                            label="Nom *"
                            value={form.name}
                            onChange={(v) => setForm({ ...form, name: v })}
                            required
                            maxLength={500}
                        />
                        <Field
                            label="EAN / GTIN"
                            value={form.ean}
                            onChange={(v) => setForm({ ...form, ean: v })}
                            placeholder="13 chiffres (optionnel)"
                        />
                        <Field
                            label="Marque"
                            value={form.brand}
                            onChange={(v) => setForm({ ...form, brand: v })}
                            maxLength={200}
                        />
                        <Field
                            label="Prix (€) *"
                            value={form.price}
                            onChange={(v) =>
                                setForm({
                                    ...form,
                                    // accepte chiffres + 1 séparateur (.,)
                                    price: v.replace(/[^\d.,]/g, ""),
                                })
                            }
                            type="text"
                            inputMode="decimal"
                            placeholder="ex 129.99"
                            required
                        />
                        <Field
                            label="Photo URL"
                            value={form.photo_url}
                            onChange={(v) => setForm({ ...form, photo_url: v })}
                            placeholder="https://…"
                        />
                        <Field
                            label="Catégorie"
                            value={form.category}
                            onChange={(v) => setForm({ ...form, category: v })}
                            placeholder="ex Sneakers, T-shirts, Cosmétiques"
                            maxLength={200}
                        />
                        <Field
                            label="Taille"
                            value={form.size}
                            onChange={(v) => setForm({ ...form, size: v })}
                            placeholder="ex 42, M, EU 41, W30 L32, 50 ml"
                            maxLength={100}
                        />
                        <Field
                            label="SKU / Référence"
                            value={form.sku}
                            onChange={(v) => setForm({ ...form, sku: v })}
                            placeholder="ex SNK-001"
                            maxLength={100}
                        />
                        <div>
                            <label className="block text-sm text-secondary mb-1">
                                Description
                            </label>
                            <textarea
                                value={form.description}
                                onChange={(e) =>
                                    setForm({ ...form, description: e.target.value })
                                }
                                rows={3}
                                maxLength={2000}
                                className="w-full px-3 py-2 border border-secondary rounded text-sm"
                                placeholder="Optionnelle, ex 'Cuir tanné chrome-free'"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="enrich-channel"
                                className="block text-sm text-secondary mb-1"
                            >
                                Channel
                            </label>
                            <select
                                id="enrich-channel"
                                value={form.channel}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        channel: e.target.value as FormState["channel"],
                                    })
                                }
                                className="w-full px-3 py-2 border border-secondary rounded text-sm"
                            >
                                <option value="in_store">in_store</option>
                                <option value="online">online</option>
                                <option value="multi">multi</option>
                            </select>
                        </div>

                        {error && <p className="text-error-primary text-sm">⚠️ {error}</p>}

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="bg-brand-solid text-white px-4 py-2 rounded font-medium hover:bg-brand-solid_hover disabled:opacity-50"
                            >
                                {isSubmitting ? "Enrichissement…" : "Enrichir et créer produit"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelected(null);
                                    setForm(EMPTY_FORM);
                                }}
                                className="px-4 py-2 border border-secondary rounded"
                            >
                                Annuler
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

function CascadeScoreBadge({
    score,
    reviewStatus,
}: {
    score: number;
    reviewStatus: "validated" | "pending" | "masked";
}) {
    const color =
        reviewStatus === "validated"
            ? "bg-success-secondary text-success-primary"
            : reviewStatus === "pending"
              ? "bg-warning-secondary text-warning-primary"
              : "bg-error-secondary text-error-primary";
    const label =
        reviewStatus === "validated"
            ? "AUTO-CLEAN ≥0.95"
            : reviewStatus === "pending"
              ? "QUEUE 0.70-0.95"
              : "MASQUÉ <0.70";
    return (
        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded ${color}`}>
            <span className="font-mono font-bold">{score.toFixed(3)}</span>
            <span>·</span>
            <span>{label}</span>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    required,
    maxLength,
    type = "text",
    inputMode,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
    type?: string;
    inputMode?: "numeric" | "text" | "decimal";
}) {
    return (
        <div>
            <label className="block text-sm text-secondary mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                maxLength={maxLength}
                inputMode={inputMode}
                className="w-full px-3 py-2 border border-secondary rounded text-sm"
            />
        </div>
    );
}
