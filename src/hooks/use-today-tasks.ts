"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";

export type TaskCategory = "onboarding" | "ops" | "nudge";
export type TaskPriority = "high" | "medium" | "low";

export type Task = {
    id: string;
    label: string;
    description?: string;
    href: string;
    cta?: string;
    category: TaskCategory;
    priority: TaskPriority;
    checked?: boolean;
};

export type UseTodayTasksResult = {
    tasks: Task[];
    loading: boolean;
    onboardingComplete: boolean;
    opsCount: number;
};

export function useTodayTasks(): UseTodayTasksResult {
    const { merchant } = useMerchant();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!merchant) return;
        let cancelled = false;

        async function run() {
            const supabase = createClient();
            const collected: Task[] = [];

            const hasPOS = merchant!.pos_type !== null;
            const hasPhone = !!merchant!.phone;
            const hasPhoto = !!merchant!.photo_url;
            const hasProfile = !!(merchant!.description && merchant!.address && merchant!.opening_hours);

            const { data: productsSample } = await supabase
                .from("products")
                .select("id, photo_url, archived_at")
                .eq("merchant_id", merchant!.id)
                .is("archived_at", null)
                .limit(50);
            const activeProducts = productsSample ?? [];
            const hasProducts = activeProducts.length > 0;

            let hasReceivedInvoiceEmail = false;
            try {
                const res = await fetch("/api/email/inbound-address");
                if (res.ok) {
                    const data = await res.json();
                    hasReceivedInvoiceEmail = data.has_received === true;
                }
            } catch {
                // ignore
            }

            // Onboarding
            if (!hasPOS && !hasProducts) {
                collected.push({
                    id: "onboarding-catalog", label: "Importer votre catalogue",
                    description: "Uploadez un fichier CSV ou une facture fournisseur.",
                    href: "/dashboard/stock/factures", cta: "Importer",
                    category: "onboarding", priority: "high", checked: false,
                });
            } else {
                collected.push({
                    id: "onboarding-catalog", label: hasPOS ? "Caisse connectée" : "Catalogue importé",
                    href: hasPOS ? "/dashboard/stock/pos" : "/dashboard/stock/mon-stock",
                    category: "onboarding", priority: "high", checked: true,
                });
            }

            collected.push({
                id: "onboarding-email", label: "Activer le transfert de factures",
                description: "Transférez vos factures fournisseurs par email.",
                href: "/dashboard/stock/factures", cta: "Activer",
                category: "onboarding", priority: "high", checked: hasReceivedInvoiceEmail,
            });
            collected.push({
                id: "onboarding-profile", label: "Compléter votre profil boutique",
                description: "Bio, adresse, horaires.", href: "/dashboard/store", cta: "Compléter",
                category: "onboarding", priority: "medium", checked: hasProfile,
            });
            collected.push({
                id: "onboarding-photo", label: "Ajouter une photo de boutique",
                description: "La première chose que les clients voient.", href: "/dashboard/store", cta: "Ajouter",
                category: "onboarding", priority: "medium", checked: hasPhoto,
            });
            collected.push({
                id: "onboarding-phone", label: "Ajouter votre téléphone de contact",
                description: "Pour que vos clients vous joignent.", href: "/dashboard/store", cta: "Ajouter",
                category: "onboarding", priority: "low", checked: hasPhone,
            });

            const mainOnboardingComplete = collected
                .filter((t) => t.category === "onboarding")
                .every((t) => t.checked);

            if (mainOnboardingComplete) {
                const { data: googleConn } = await supabase
                    .from("google_merchant_connections").select("id")
                    .eq("merchant_id", merchant!.id).maybeSingle();
                collected.push({
                    id: "onboarding-google", label: "🎁 Connecter Google Merchant Center",
                    description: "Vos produits sur Google Shopping.", href: "/dashboard/google", cta: "Connecter",
                    category: "onboarding", priority: "low", checked: !!googleConn,
                });
            }

            // Ops: invoices pending
            const { data: pendingInvoices } = await supabase
                .from("invoices").select("id, supplier_name, received_at")
                .eq("merchant_id", merchant!.id).eq("ux_status", "pending")
                .order("received_at", { ascending: false }).limit(10);
            const pendingCount = pendingInvoices?.length ?? 0;
            if (pendingCount > 0) {
                collected.push({
                    id: "ops-pending-invoices",
                    label: `${pendingCount} facture${pendingCount > 1 ? "s" : ""} à valider`,
                    href: "/dashboard/stock/factures?status=pending",
                    category: "ops", priority: "high",
                });
            }

            // Ops: incomplete products
            const incompleteCount = activeProducts.filter((p: any) => !p.photo_url).length;
            if (incompleteCount > 0) {
                collected.push({
                    id: "ops-incomplete-products",
                    label: `${incompleteCount} produit${incompleteCount > 1 ? "s" : ""} à compléter`,
                    description: "Photo manquante",
                    href: "/dashboard/stock/mon-stock?filter=incomplete",
                    category: "ops", priority: "medium",
                });
            }

            // Ops: POS sync problem — defer to /api/pos/status for the single
            // source of truth (aligned with the widget on the home).
            if (hasPOS) {
                try {
                    const statusRes = await fetch("/api/pos/status");
                    if (statusRes.ok) {
                        const posStatus = await statusRes.json() as {
                            state?: string; pos_type?: string | null;
                            problem_reason?: string | null; last_sync_error?: string | null;
                        };
                        if (posStatus.state === "problem") {
                            const reason = posStatus.problem_reason === "token_expired"
                                ? "Token expiré"
                                : posStatus.problem_reason === "api_error"
                                    ? posStatus.last_sync_error ?? "Erreur de sync"
                                    : "Sync en retard";
                            collected.push({
                                id: "ops-pos-reconnect",
                                label: `Reconnecter ${posStatus.pos_type ?? "la caisse"}`,
                                description: reason,
                                href: "/dashboard/stock/pos?mode=reconnect",
                                category: "ops", priority: "high",
                            });
                        }
                    }
                } catch {
                    // keep silent — the widget will still surface the issue
                }
            }

            // Ops: close-of-day (non-POS only)
            if (!hasPOS && merchant!.opening_hours) {
                if (isCloseOfDayDue(merchant!.opening_hours)) {
                    collected.push({
                        id: "ops-close-of-day",
                        label: "Clôture du soir",
                        description: "Marquer les variantes en rupture",
                        href: "/dashboard/stock/cloture",
                        category: "ops", priority: "medium",
                    });
                }
            }

            if (!cancelled) {
                setTasks(collected);
                setLoading(false);
            }
        }

        run();
        return () => { cancelled = true; };
    }, [merchant]);

    const opsCount = tasks.filter((t) => t.category === "ops").length;
    const onboardingComplete = tasks
        .filter((t) => t.category === "onboarding" && t.id !== "onboarding-google")
        .every((t) => t.checked);

    return { tasks, loading, onboardingComplete, opsCount };
}

function isCloseOfDayDue(openingHours: any): boolean {
    const now = new Date();
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const today = openingHours?.[dayNames[now.getDay()]];
    if (!today?.close) return false;

    const [closeH, closeM] = String(today.close).split(":").map(Number);
    if (isNaN(closeH) || isNaN(closeM)) return false;

    const closeDate = new Date(now);
    closeDate.setHours(closeH, closeM, 0, 0);
    const oneHourBefore = new Date(closeDate.getTime() - 60 * 60 * 1000);
    return now >= oneHourBefore && now <= closeDate;
}
