"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Merchant } from "@/lib/types";

type ChecklistItem = {
    label: string;
    checked: boolean;
};

export function OnboardingChecklist({ merchant }: { merchant: Merchant | null }) {
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!merchant) return;

        async function check() {
            const supabase = createClient();

            const hasProfile = !!(merchant!.name && merchant!.address);
            const hasPOS = merchant!.pos_type !== null;

            const { data: emailConn } = await supabase
                .from("email_connections")
                .select("id")
                .eq("merchant_id", merchant!.id)
                .eq("status", "active")
                .limit(1);
            const hasEmail = (emailConn?.length ?? 0) > 0;

            const { data: invoices } = await supabase
                .from("invoices")
                .select("id")
                .eq("merchant_id", merchant!.id)
                .eq("status", "imported")
                .limit(1);
            const hasImport = (invoices?.length ?? 0) > 0;

            const { data: products } = await supabase
                .from("products")
                .select("id, stock(quantity)")
                .eq("merchant_id", merchant!.id)
                .limit(1);
            const hasProduct = (products?.length ?? 0) > 0 && products!.some(
                (p: any) => p.stock?.[0]?.quantity > 0 || p.stock?.quantity > 0
            );

            setItems([
                { label: "Profil boutique complété", checked: hasProfile },
                { label: "Caisse connectée", checked: hasPOS },
                { label: "Email connecté", checked: hasEmail },
                { label: "Premier import de produits", checked: hasImport },
                { label: "Premier produit visible", checked: hasProduct },
            ]);
            setLoading(false);
        }

        check();
    }, [merchant]);

    if (loading || !merchant) return null;

    const allDone = items.every((i) => i.checked);
    if (allDone) return null;

    const completed = items.filter((i) => i.checked).length;

    return (
        <div className="mb-8 rounded-xl bg-white px-5 py-5">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Configuration de votre boutique</h3>
                <span className="text-xs text-gray-400">{completed}/{items.length}</span>
            </div>
            <div className="space-y-2.5">
                {items.map((item) => (
                    <div key={item.label} className="flex items-center gap-2.5">
                        <div className={`flex size-5 items-center justify-center rounded-full border ${item.checked ? "border-[#5a9474] bg-[var(--ts-sage-light)]" : "border-gray-200"}`}>
                            {item.checked && (
                                <svg className="size-3 text-[#5a9474]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 6l3 3 5-5" />
                                </svg>
                            )}
                        </div>
                        <span className={`text-xs ${item.checked ? "text-gray-400 line-through" : "text-gray-700"}`}>
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
