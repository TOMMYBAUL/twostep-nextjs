"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Merchant } from "@/lib/types";

type ChecklistItem = {
    label: string;
    href: string;
    cta: string;
    checked: boolean;
};

export function OnboardingChecklist({ merchant }: { merchant: Merchant | null }) {
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!merchant) return;

        async function check() {
            const supabase = createClient();

            const hasPOS = merchant!.pos_type !== null;
            const hasPhone = !!(merchant!.phone);
            const hasPhoto = !!(merchant!.photo_url);
            const hasProfile = !!(merchant!.description && merchant!.address && merchant!.opening_hours);

            const { data: products } = await supabase
                .from("products")
                .select("id, photo_url")
                .eq("merchant_id", merchant!.id)
                .limit(50);
            const totalProducts = products?.length ?? 0;
            const withPhoto = products?.filter((p: any) => p.photo_url).length ?? 0;
            const hasProductPhotos = totalProducts > 0 && withPhoto >= Math.min(totalProducts, 3);
            const hasProducts = totalProducts > 0;

            const checklist: ChecklistItem[] = [];

            // Step 1: POS or import
            if (hasPOS) {
                checklist.push({ label: "Caisse connectée", href: "/dashboard/settings", cta: "Voir", checked: true });
            } else {
                checklist.push({ label: "Importer votre catalogue", href: "/dashboard/invoices", cta: "Importer", checked: hasProducts });
            }

            // Step 2: Email factures (for all)
            let hasReceivedEmail = false;
            try {
                const emailRes = await fetch("/api/email/inbound-address");
                if (emailRes.ok) {
                    const emailData = await emailRes.json();
                    hasReceivedEmail = emailData.has_received === true;
                }
            } catch {
                // laisser unchecked en cas d'erreur
            }
            checklist.push({ label: "Activer le transfert de factures par email", href: "/dashboard/invoices", cta: "Activer", checked: hasReceivedEmail });

            // Step 3-5: Profile
            checklist.push({ label: "Compléter votre profil boutique", href: "/dashboard/store", cta: "Compléter", checked: hasProfile });
            checklist.push({ label: "Ajouter une photo de boutique", href: "/dashboard/store", cta: "Ajouter", checked: hasPhoto });
            checklist.push({ label: "Ajouter votre téléphone de contact", href: "/dashboard/store", cta: "Ajouter", checked: hasPhone });

            setItems(checklist);
            setLoading(false);
        }

        check();
    }, [merchant]);

    if (loading || !merchant) return null;

    const allDone = items.every((i) => i.checked);
    if (allDone) return null;

    const completed = items.filter((i) => i.checked).length;

    return (
        <div className="mb-6 rounded-xl bg-primary overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-3 px-5 py-3.5 transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-primary">Configuration boutique</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-tertiary">
                            {completed}/{items.length}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                            className="h-full rounded-full transition-all duration-500 bg-brand-solid"
                            style={{ width: `${(completed / items.length) * 100}%` }}
                        />
                    </div>
                </div>
                <svg
                    aria-hidden="true"
                    className={`size-4 shrink-0 text-quaternary transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {expanded && (
                <div className="border-t border-tertiary px-5 py-3 space-y-2">
                    {items.map((item, i) => (
                        <div key={item.label} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${item.checked ? "opacity-50" : ""}`}>
                            <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                                item.checked ? "bg-brand-secondary text-brand-secondary" : "bg-secondary text-tertiary"
                            }`}>
                                {item.checked ? (
                                    <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 6l3 3 5-5" />
                                    </svg>
                                ) : (
                                    i + 1
                                )}
                            </div>
                            <p className={`flex-1 text-xs font-medium ${item.checked ? "text-quaternary line-through" : "text-primary"}`}>
                                {item.label}
                            </p>
                            {!item.checked && (
                                <Link href={item.href} className="shrink-0 text-[10px] font-semibold text-brand-secondary no-underline hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                                    {item.cta}
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
