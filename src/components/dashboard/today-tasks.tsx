"use client";

import Link from "next/link";
import type { DashboardStats } from "@/hooks/use-dashboard-stats";

type Task = { id: string; label: string; href: string; priority: "high" | "medium" | "low" };

function generateTasks(stats: DashboardStats): Task[] {
    const tasks: Task[] = [];

    if (stats.stock.outOfStock > 0) {
        tasks.push({ id: "restock", label: `${stats.stock.outOfStock} produit${stats.stock.outOfStock > 1 ? "s" : ""} en rupture de stock`, href: "/dashboard/products", priority: "high" });
    }
    if (stats.stock.lowStock > 0) {
        tasks.push({ id: "low-stock", label: `${stats.stock.lowStock} produit${stats.stock.lowStock > 1 ? "s" : ""} en stock bas (≤ 3)`, href: "/dashboard/products", priority: "high" });
    }
    const missingPhotos = stats.stock.total - stats.stock.withPhoto;
    if (missingPhotos > 0) {
        tasks.push({ id: "photos", label: `Ajouter des photos à ${missingPhotos} produit${missingPhotos > 1 ? "s" : ""}`, href: "/dashboard/products", priority: "medium" });
    }
    if (stats.activePromos === 0 && stats.stock.inStock > 0) {
        tasks.push({ id: "promo", label: "Créer votre première promotion", href: "/dashboard/promotions", priority: "low" });
    }
    if (stats.stock.total === 0) {
        tasks.push({ id: "add-products", label: "Ajouter vos premiers produits", href: "/dashboard/products/new", priority: "high" });
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 3);
}

const priorityDot: Record<string, string> = { high: "#c4553a", medium: "#4268FF", low: "#22B86E" };

export function TodayTasks({ stats }: { stats: DashboardStats }) {
    const tasks = generateTasks(stats);

    if (tasks.length === 0) {
        return (
            <div className="rounded-xl bg-success-secondary px-5 py-4">
                <p className="text-sm font-semibold text-success-primary">Tout est en ordre !</p>
                <p className="mt-0.5 text-xs text-success-primary/80">Votre boutique est bien configurée. Continuez comme ça.</p>
            </div>
        );
    }

    return (
        <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tertiary">{"Aujourd'hui"}</h3>
            <div className="space-y-2">
                {tasks.map((task) => (
                    <Link key={task.id} href={task.href} className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 transition hover:shadow-sm no-underline group focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: priorityDot[task.priority] }} aria-hidden="true" />
                        <span className="flex-1 text-sm text-primary group-hover:text-brand-secondary transition">{task.label}</span>
                        <span className="text-xs text-tertiary">→</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
