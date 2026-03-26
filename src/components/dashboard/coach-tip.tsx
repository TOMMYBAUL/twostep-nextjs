"use client";

import type { DashboardStats } from "@/hooks/use-dashboard-stats";

function generateTip(stats: DashboardStats): { emoji: string; text: string } {
    if (stats.stock.total === 0) return { emoji: "🚀", text: "Ajoutez vos premiers produits pour apparaître dans les recherches des Toulousains." };

    const photoRatio = stats.stock.withPhoto / Math.max(stats.stock.total, 1);
    if (photoRatio < 0.5) return { emoji: "📸", text: `Les boutiques avec des photos reçoivent 3× plus de vues. ${stats.stock.total - stats.stock.withPhoto} de vos produits n'ont pas encore de photo.` };

    if (stats.activePromos === 0 && stats.stock.inStock > 0) return { emoji: "🏷️", text: "Les marchands avec au moins une promotion active apparaissent en priorité dans « Promos du moment »." };

    if (stats.funnel.views.current > 0 && stats.funnel.favorites.current === 0) return { emoji: "💡", text: "Des gens voient votre boutique mais ne mettent rien en favori. Essayez d'ajouter des descriptions plus détaillées à vos produits." };

    if (stats.funnel.views.current > (stats.funnel.views.previous || 1) * 1.2) return { emoji: "📈", text: "Vos vues sont en hausse ! Continuez à garder votre stock à jour pour convertir ces visiteurs." };

    if (stats.stock.lowStock > 0) return { emoji: "📦", text: `${stats.stock.lowStock} produit${stats.stock.lowStock > 1 ? "s" : ""} en stock bas. Pensez à réapprovisionner pour ne pas perdre de visibilité.` };

    return { emoji: "✨", text: "Votre boutique est bien configurée. Partagez votre profil Two-Step sur vos réseaux sociaux pour attirer plus de clients." };
}

export function CoachTip({ stats }: { stats: DashboardStats }) {
    const tip = generateTip(stats);

    return (
        <div className="rounded-xl border border-[var(--ts-terracotta)]/10 bg-[var(--ts-terracotta)]/5 px-5 py-4">
            <div className="flex gap-3">
                <span className="text-lg">{tip.emoji}</span>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ts-terracotta)" }}>Conseil du jour</p>
                    <p className="mt-1 text-sm text-primary leading-relaxed">{tip.text}</p>
                </div>
            </div>
        </div>
    );
}
