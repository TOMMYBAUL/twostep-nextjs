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

interface FormState {
    name: string;
    ean: string;
    brand: string;
    price: string; // garde en string pour input (€ avec décimales), convert au submit
    photo_url: string;
    channel: "online" | "in_store" | "multi";
}

const EMPTY_FORM: FormState = {
    name: "",
    ean: "",
    brand: "",
    price: "",
    photo_url: "",
    channel: "in_store",
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
    const photo = get("Photo URL", "Photo", "photo_url", "Image", "image_url", "Image URL");

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
