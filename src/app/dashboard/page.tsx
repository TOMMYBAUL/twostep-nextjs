"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useMerchant } from "@/hooks/use-merchant";
import { createClient } from "@/lib/supabase/client";

type Step = {
    label: string;
    description: string;
    href: string;
    cta: string;
    checked: boolean;
};

export default function DashboardPage() {
    const { merchant } = useMerchant();
    const [steps, setSteps] = useState<Step[]>([]);
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

            setSteps([
                {
                    label: "Compléter votre profil boutique",
                    description: "Nom, adresse, horaires d'ouverture — les infos visibles par les clients.",
                    href: "/dashboard/store",
                    cta: "Compléter le profil",
                    checked: hasProfile,
                },
                {
                    label: "Connecter votre caisse (POS)",
                    description: "Square, Lightspeed ou Shopify — votre stock se synchronise automatiquement.",
                    href: "/dashboard/settings",
                    cta: "Connecter ma caisse",
                    checked: hasPOS,
                },
                {
                    label: "Connecter votre email",
                    description: "Gmail ou Outlook — vos factures fournisseur sont importées automatiquement.",
                    href: "/dashboard/settings",
                    cta: "Connecter mon email",
                    checked: hasEmail,
                },
                {
                    label: "Importer vos premiers produits",
                    description: "Via votre caisse, vos factures, ou manuellement.",
                    href: "/dashboard/invoices",
                    cta: "Importer des produits",
                    checked: hasImport,
                },
                {
                    label: "Avoir un produit visible en stock",
                    description: "Dès qu'un produit a du stock, il apparaît aux consommateurs sur Two-Step.",
                    href: "/dashboard/products",
                    cta: "Voir mes produits",
                    checked: hasProduct,
                },
            ]);
            setLoading(false);
        }

        check();
    }, [merchant]);

    const completed = steps.filter((s) => s.checked).length;
    const allDone = steps.length > 0 && completed === steps.length;

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Bienvenue sur"
                titleAccent="Two-Step"
            />

            {loading ? (
                <p className="text-secondary py-8 text-center">Chargement...</p>
            ) : allDone ? (
                /* All done — show quick links */
                <div className="max-w-2xl">
                    <div className="mb-8 rounded-xl bg-[var(--ts-sage-light)] px-6 py-5">
                        <p className="text-sm font-semibold text-[#5a9474]">Votre boutique est opérationnelle !</p>
                        <p className="mt-1 text-xs text-[#5a9474]/80">
                            Vos produits sont visibles par les consommateurs de Toulouse sur Two-Step.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <QuickLink href="/dashboard/products" label="Mes produits" description="Gérer votre catalogue" />
                        <QuickLink href="/dashboard/invoices" label="Mes factures" description="Importer de nouveaux produits" />
                        <QuickLink href="/dashboard/stock" label="Mon stock" description="Voir les niveaux de stock" />
                        <QuickLink href="/dashboard/settings" label="Réglages" description="Caisse, email, abonnement" />
                    </div>
                </div>
            ) : (
                /* Onboarding — show checklist */
                <div className="max-w-2xl">
                    <div className="mb-6 flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                            Configurez votre boutique en {steps.length} étapes pour être visible sur Two-Step.
                        </p>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                            {completed}/{steps.length}
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${(completed / steps.length) * 100}%`,
                                background: "var(--ts-ochre)",
                            }}
                        />
                    </div>

                    <div className="space-y-3">
                        {steps.map((step, i) => (
                            <div
                                key={step.label}
                                className={`flex items-start gap-4 rounded-xl bg-white px-5 py-4 transition ${
                                    step.checked ? "opacity-60" : ""
                                }`}
                            >
                                {/* Step number / check */}
                                <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                    step.checked
                                        ? "bg-[var(--ts-sage-light)] text-[#5a9474]"
                                        : "bg-gray-100 text-gray-500"
                                }`}>
                                    {step.checked ? (
                                        <svg className="size-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 6l3 3 5-5" />
                                        </svg>
                                    ) : (
                                        i + 1
                                    )}
                                </div>

                                {/* Text */}
                                <div className="flex-1">
                                    <p className={`text-sm font-medium ${step.checked ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                        {step.label}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-400">{step.description}</p>
                                </div>

                                {/* CTA */}
                                {!step.checked && (
                                    <Link href={step.href} className="btn-ts shrink-0 text-xs no-underline">
                                        {step.cta}
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

function QuickLink({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <Link href={href} className="group rounded-xl bg-white px-5 py-4 no-underline transition hover:shadow-sm">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-[var(--ts-ochre)] transition">{label}</p>
            <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        </Link>
    );
}
