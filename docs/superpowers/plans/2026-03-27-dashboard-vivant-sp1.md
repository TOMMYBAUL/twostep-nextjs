# Dashboard Vivant SP1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer la page d'accueil du dashboard marchand Two-Step d'une simple checklist en un tableau de bord vivant avec chiffre hero, funnel découverte, tâches du jour, conseil coach et score de progression.

**Architecture:** Le dashboard home (`/dashboard/page.tsx`) devient un écran unique composé de widgets modulaires. Chaque widget est un composant isolé qui fetch ses propres données via un hook dédié. Une nouvelle API route `/api/merchants/[id]/stats` agrège les métriques côté serveur. L'onboarding checklist existante reste visible uniquement si le marchand n'a pas terminé ses 5 étapes.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL + RPC, React 19, Tailwind CSS v4.1 + variables Two-Step, framer-motion (animations chiffres), composants Untitled UI existants.

**Spec:** `docs/research/dashboard-benchmark-2026.md` — Section 6 (Blueprint)
**Mémoire:** `memory/project_twostep_dashboard_vision.md`

---

## File Structure

```
src/
├── app/
│   ├── api/merchants/[id]/stats/route.ts    ← NEW: API agrégation métriques
│   └── dashboard/
│       └── page.tsx                          ← MODIFY: refonte complète
├── components/dashboard/
│   ├── hero-stat.tsx                         ← NEW: chiffre hero animé
│   ├── discovery-funnel.tsx                  ← NEW: vues → favoris → visites
│   ├── today-tasks.tsx                       ← NEW: tâches du jour contextuelles
│   ├── coach-tip.tsx                         ← NEW: conseil du jour
│   ├── twostep-score.tsx                     ← NEW: score progression 0-100
│   ├── quick-stats-grid.tsx                  ← NEW: grille 3 mini-métriques
│   └── onboarding-checklist.tsx              ← EXISTS: gardé tel quel
├── hooks/
│   └── use-dashboard-stats.ts               ← NEW: hook stats dashboard
└── lib/
    └── compute-score.ts                      ← NEW: calcul Two-Step Score
```

---

## Task 1: API route stats marchand

**Files:**
- Create: `src/app/api/merchants/[id]/stats/route.ts`

Cette route agrège toutes les métriques du marchand en un seul appel.

- [ ] **Step 1: Créer la route API stats**

```typescript
// src/app/api/merchants/[id]/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Vérifier que le marchand appartient à l'utilisateur
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, name, photo_url, status, pos_type")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Période: 7 derniers jours vs 7 jours précédents
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 1. Vues boutique (page_views sur la période)
    const { count: viewsThisWeek } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", id)
        .gte("created_at", weekAgo.toISOString());

    const { count: viewsLastWeek } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", id)
        .gte("created_at", twoWeeksAgo.toISOString())
        .lt("created_at", weekAgo.toISOString());

    // 2. Favoris reçus
    const { count: favoritesThisWeek } = await supabase
        .from("favorites")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", id)
        .gte("created_at", weekAgo.toISOString());

    const { count: favoritesLastWeek } = await supabase
        .from("favorites")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", id)
        .gte("created_at", twoWeeksAgo.toISOString())
        .lt("created_at", weekAgo.toISOString());

    // 3. Follows (boutique suivie)
    const { count: followsTotal } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", id);

    // 4. Produits & stock
    const { data: products } = await supabase
        .from("products")
        .select("id, name, photo_url, stock(quantity)")
        .eq("merchant_id", id);

    const totalProducts = products?.length ?? 0;
    const inStock = products?.filter((p: any) => (p.stock?.[0]?.quantity ?? p.stock?.quantity ?? 0) > 0).length ?? 0;
    const lowStock = products?.filter((p: any) => {
        const qty = p.stock?.[0]?.quantity ?? p.stock?.quantity ?? 0;
        return qty > 0 && qty <= 3;
    }).length ?? 0;
    const outOfStock = products?.filter((p: any) => (p.stock?.[0]?.quantity ?? p.stock?.quantity ?? 0) === 0).length ?? 0;
    const withPhoto = products?.filter((p: any) => !!p.photo_url).length ?? 0;

    // 5. Promos actives
    const { count: activePromos } = await supabase
        .from("promotions")
        .select("*", { count: "exact", head: true })
        .eq("merchant_id", id)
        .lte("starts_at", now.toISOString())
        .gte("ends_at", now.toISOString());

    // 6. Score Two-Step (calculé côté serveur)
    const hasName = !!merchant.name;
    const hasPhoto = !!merchant.photo_url;
    const hasPOS = !!merchant.pos_type;
    const hasProducts = totalProducts > 0;
    const hasStock = inStock > 0;

    const profileComplete = [hasName, hasPhoto, hasPOS, hasProducts, hasStock].filter(Boolean).length;
    const photoRatio = totalProducts > 0 ? withPhoto / totalProducts : 0;

    const score = Math.round(
        (profileComplete / 5) * 40 +    // 40% profil complet
        Math.min(photoRatio, 1) * 20 +   // 20% photos produits
        Math.min((inStock / Math.max(totalProducts, 1)), 1) * 20 + // 20% stock à jour
        Math.min((activePromos ?? 0) / 2, 1) * 10 + // 10% promos actives (max 2)
        (followsTotal && followsTotal > 0 ? 10 : 0)  // 10% au moins 1 follower
    );

    return NextResponse.json({
        funnel: {
            views: { current: viewsThisWeek ?? 0, previous: viewsLastWeek ?? 0 },
            favorites: { current: favoritesThisWeek ?? 0, previous: favoritesLastWeek ?? 0 },
            follows: { total: followsTotal ?? 0 },
        },
        stock: {
            total: totalProducts,
            inStock,
            lowStock,
            outOfStock,
            withPhoto,
        },
        score,
        activePromos: activePromos ?? 0,
    }, {
        headers: { "Cache-Control": "private, max-age=60" },
    });
}
```

- [ ] **Step 2: Vérifier que la route compile**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx next build --no-lint 2>&1 | head -20`

Note: Si la table `page_views` n'existe pas encore, la créer dans le Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/merchants/\[id\]/stats/route.ts
git commit -m "feat(api): add merchant stats aggregation endpoint"
```

---

## Task 2: Migration Supabase — table page_views

**Files:**
- Create: `supabase/migrations/20260327_page_views.sql`

La table `page_views` track les vues de boutique côté consumer pour alimenter le funnel.

- [ ] **Step 1: Créer le fichier de migration**

```sql
-- supabase/migrations/20260327_page_views.sql
-- Track merchant page views from consumer app
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS page_views (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    page_type text NOT NULL DEFAULT 'shop',  -- 'shop' | 'product'
    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Index pour les requêtes de stats par marchand + période
CREATE INDEX idx_page_views_merchant_date ON page_views (merchant_id, created_at DESC);

-- RLS: insert public (consumer app), select par marchand owner
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert page views"
    ON page_views FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Merchants can view their own page views"
    ON page_views FOR SELECT
    USING (
        merchant_id IN (
            SELECT id FROM merchants WHERE user_id = auth.uid()
        )
    );

-- Ajouter merchant_id aux favorites si pas déjà présent
-- (nécessaire pour le funnel: compter les favoris par marchand)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'favorites' AND column_name = 'merchant_id'
    ) THEN
        ALTER TABLE favorites ADD COLUMN merchant_id uuid REFERENCES merchants(id);
        CREATE INDEX idx_favorites_merchant ON favorites (merchant_id, created_at DESC);
    END IF;
END $$;
```

- [ ] **Step 2: Documenter pour Thomas**

Ce SQL doit être exécuté manuellement dans le Supabase SQL Editor (dashboard Supabase). Thomas devra le copier-coller.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327_page_views.sql
git commit -m "feat(db): add page_views table for merchant discovery funnel"
```

---

## Task 3: Hook useDashboardStats

**Files:**
- Create: `src/hooks/use-dashboard-stats.ts`

- [ ] **Step 1: Créer le hook**

```typescript
// src/hooks/use-dashboard-stats.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useMerchant } from "./use-merchant";

export type DashboardStats = {
    funnel: {
        views: { current: number; previous: number };
        favorites: { current: number; previous: number };
        follows: { total: number };
    };
    stock: {
        total: number;
        inStock: number;
        lowStock: number;
        outOfStock: number;
        withPhoto: number;
    };
    score: number;
    activePromos: number;
};

export function useDashboardStats() {
    const { merchant } = useMerchant();

    return useQuery<DashboardStats>({
        queryKey: ["dashboard-stats", merchant?.id],
        queryFn: async () => {
            const res = await fetch(`/api/merchants/${merchant!.id}/stats`);
            if (!res.ok) throw new Error("Failed to fetch stats");
            return res.json();
        },
        enabled: !!merchant?.id,
        refetchInterval: 60_000, // Refresh toutes les 60s
        staleTime: 30_000,
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-dashboard-stats.ts
git commit -m "feat: add useDashboardStats hook with auto-refresh"
```

---

## Task 4: Composant HeroStat (chiffre hero animé)

**Files:**
- Create: `src/components/dashboard/hero-stat.tsx`

Le gros chiffre motivant en haut du dashboard — inspiré Stripe.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/dashboard/hero-stat.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type HeroStatProps = {
    value: number;
    label: string;
    trend?: number; // pourcentage +/- vs période précédente
};

function useCountUp(target: number, duration = 800) {
    const [current, setCurrent] = useState(0);
    const prevTarget = useRef(0);

    useEffect(() => {
        if (target === prevTarget.current) return;
        const start = prevTarget.current;
        prevTarget.current = target;
        const startTime = performance.now();

        function animate(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCurrent(Math.round(start + (target - start) * eased));
            if (progress < 1) requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);
    }, [target, duration]);

    return current;
}

export function HeroStat({ value, label, trend }: HeroStatProps) {
    const animatedValue = useCountUp(value);
    const trendPositive = trend !== undefined && trend >= 0;

    return (
        <div className="text-center">
            <p className="text-5xl font-bold tracking-tight" style={{ color: "var(--ts-dark)" }}>
                {animatedValue}
            </p>
            <p className="mt-1 text-sm text-secondary">{label}</p>
            {trend !== undefined && trend !== 0 && (
                <p className={`mt-1 text-xs font-medium ${trendPositive ? "text-[#5a9474]" : "text-[#c4553a]"}`}>
                    {trendPositive ? "+" : ""}{trend}% vs semaine dernière
                </p>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/hero-stat.tsx
git commit -m "feat(dashboard): add animated HeroStat component"
```

---

## Task 5: Composant DiscoveryFunnel (vues → favoris → follows)

**Files:**
- Create: `src/components/dashboard/discovery-funnel.tsx`

Inspiré Etsy — le marchand voit son funnel de découverte.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/dashboard/discovery-funnel.tsx
"use client";

type FunnelProps = {
    views: { current: number; previous: number };
    favorites: { current: number; previous: number };
    follows: { total: number };
};

function FunnelStep({ value, label, trend, icon }: { value: number; label: string; trend?: number; icon: string }) {
    const trendPositive = trend !== undefined && trend >= 0;
    return (
        <div className="flex-1 rounded-xl bg-white px-4 py-3 text-center">
            <p className="text-xs text-tertiary">{icon}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "var(--ts-dark)" }}>{value}</p>
            <p className="text-xs text-secondary">{label}</p>
            {trend !== undefined && trend !== 0 && (
                <p className={`mt-0.5 text-[10px] font-medium ${trendPositive ? "text-[#5a9474]" : "text-[#c4553a]"}`}>
                    {trendPositive ? "↑" : "↓"} {Math.abs(trend)}%
                </p>
            )}
        </div>
    );
}

function computeTrend(current: number, previous: number): number | undefined {
    if (previous === 0 && current === 0) return undefined;
    if (previous === 0) return 100;
    return Math.round(((current - previous) / previous) * 100);
}

export function DiscoveryFunnel({ views, favorites, follows }: FunnelProps) {
    return (
        <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tertiary">
                Votre vitrine cette semaine
            </h3>
            <div className="flex gap-2">
                <FunnelStep
                    icon="👀"
                    value={views.current}
                    label="Vues"
                    trend={computeTrend(views.current, views.previous)}
                />
                <div className="flex items-center text-tertiary">→</div>
                <FunnelStep
                    icon="♡"
                    value={favorites.current}
                    label="Favoris"
                    trend={computeTrend(favorites.current, favorites.previous)}
                />
                <div className="flex items-center text-tertiary">→</div>
                <FunnelStep
                    icon="🏪"
                    value={follows.total}
                    label="Abonnés"
                />
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/discovery-funnel.tsx
git commit -m "feat(dashboard): add DiscoveryFunnel component (views → favorites → follows)"
```

---

## Task 6: Composant TwoStepScore (score progression)

**Files:**
- Create: `src/components/dashboard/twostep-score.tsx`

Score 0-100 avec barre de progression — inspiré Intercom CX Score.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/dashboard/twostep-score.tsx
"use client";

type ScoreProps = {
    score: number; // 0-100
};

function getScoreColor(score: number) {
    if (score >= 80) return "#5a9474"; // sage — excellent
    if (score >= 50) return "#E07A5F"; // terracotta — en progrès
    return "#c4553a"; // rouge — à améliorer
}

function getScoreLabel(score: number) {
    if (score >= 80) return "Excellent";
    if (score >= 50) return "En progrès";
    return "À configurer";
}

export function TwoStepScore({ score }: ScoreProps) {
    const color = getScoreColor(score);
    const label = getScoreLabel(score);

    return (
        <div className="rounded-xl bg-white px-5 py-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                        Score Two-Step
                    </h3>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
                        <span className="text-sm text-secondary">/100</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color, background: `${color}15` }}>
                            {label}
                        </span>
                    </div>
                </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${score}%`, background: color }}
                />
            </div>
            {score < 80 && (
                <p className="mt-2 text-xs text-tertiary">
                    {score < 50
                        ? "Complétez votre profil et ajoutez des produits pour être visible."
                        : "Ajoutez des photos à vos produits et créez une promo pour atteindre 80+."}
                </p>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/twostep-score.tsx
git commit -m "feat(dashboard): add TwoStepScore progression component"
```

---

## Task 7: Composant TodayTasks (tâches du jour)

**Files:**
- Create: `src/components/dashboard/today-tasks.tsx`

Inspiré Airbnb Today Tab — max 3 tâches actionnables.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/dashboard/today-tasks.tsx
"use client";

import Link from "next/link";
import type { DashboardStats } from "@/hooks/use-dashboard-stats";

type Task = {
    id: string;
    label: string;
    href: string;
    priority: "high" | "medium" | "low";
};

function generateTasks(stats: DashboardStats, hasPhoto: boolean, hasDescription: boolean): Task[] {
    const tasks: Task[] = [];

    // Ruptures de stock — priorité haute
    if (stats.stock.outOfStock > 0) {
        tasks.push({
            id: "restock",
            label: `${stats.stock.outOfStock} produit${stats.stock.outOfStock > 1 ? "s" : ""} en rupture de stock`,
            href: "/dashboard/stock",
            priority: "high",
        });
    }

    // Stock bas — priorité haute
    if (stats.stock.lowStock > 0) {
        tasks.push({
            id: "low-stock",
            label: `${stats.stock.lowStock} produit${stats.stock.lowStock > 1 ? "s" : ""} en stock bas (≤ 3)`,
            href: "/dashboard/stock",
            priority: "high",
        });
    }

    // Photos manquantes — priorité moyenne
    const missingPhotos = stats.stock.total - stats.stock.withPhoto;
    if (missingPhotos > 0) {
        tasks.push({
            id: "photos",
            label: `Ajouter des photos à ${missingPhotos} produit${missingPhotos > 1 ? "s" : ""}`,
            href: "/dashboard/products",
            priority: "medium",
        });
    }

    // Pas de promo active — priorité basse
    if (stats.activePromos === 0 && stats.stock.inStock > 0) {
        tasks.push({
            id: "promo",
            label: "Créer votre première promotion",
            href: "/dashboard/promotions",
            priority: "low",
        });
    }

    // Pas de produits — priorité haute
    if (stats.stock.total === 0) {
        tasks.push({
            id: "add-products",
            label: "Ajouter vos premiers produits",
            href: "/dashboard/products/new",
            priority: "high",
        });
    }

    // Trier par priorité et garder max 3
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 3);
}

type TodayTasksProps = {
    stats: DashboardStats;
    merchantHasPhoto: boolean;
    merchantHasDescription: boolean;
};

const priorityDot: Record<string, string> = {
    high: "#c4553a",
    medium: "#E07A5F",
    low: "#81B29A",
};

export function TodayTasks({ stats, merchantHasPhoto, merchantHasDescription }: TodayTasksProps) {
    const tasks = generateTasks(stats, merchantHasPhoto, merchantHasDescription);

    if (tasks.length === 0) {
        return (
            <div className="rounded-xl bg-[#e8f3ee] px-5 py-4">
                <p className="text-sm font-semibold text-[#5a9474]">Tout est en ordre !</p>
                <p className="mt-0.5 text-xs text-[#5a9474]/80">
                    Votre boutique est bien configurée. Continuez comme ça.
                </p>
            </div>
        );
    }

    return (
        <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tertiary">
                Aujourd'hui
            </h3>
            <div className="space-y-2">
                {tasks.map((task) => (
                    <Link
                        key={task.id}
                        href={task.href}
                        className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 transition hover:shadow-sm no-underline group"
                    >
                        <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: priorityDot[task.priority] }}
                        />
                        <span className="flex-1 text-sm text-primary group-hover:text-[var(--ts-terracotta)] transition">
                            {task.label}
                        </span>
                        <span className="text-xs text-tertiary">→</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/today-tasks.tsx
git commit -m "feat(dashboard): add TodayTasks component with priority-based task generation"
```

---

## Task 8: Composant CoachTip (conseil du jour)

**Files:**
- Create: `src/components/dashboard/coach-tip.tsx`

Conseil contextuel basé sur les données — inspiré Uber Eats AI insights.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/dashboard/coach-tip.tsx
"use client";

import type { DashboardStats } from "@/hooks/use-dashboard-stats";

function generateTip(stats: DashboardStats): { emoji: string; text: string } {
    // Priorité aux tips les plus impactants
    if (stats.stock.total === 0) {
        return {
            emoji: "🚀",
            text: "Ajoutez vos premiers produits pour apparaître dans les recherches des Toulousains.",
        };
    }

    const photoRatio = stats.stock.withPhoto / Math.max(stats.stock.total, 1);
    if (photoRatio < 0.5) {
        return {
            emoji: "📸",
            text: `Les boutiques avec des photos reçoivent 3× plus de vues. ${stats.stock.total - stats.stock.withPhoto} de vos produits n'ont pas encore de photo.`,
        };
    }

    if (stats.activePromos === 0 && stats.stock.inStock > 0) {
        return {
            emoji: "🏷️",
            text: "Les marchands avec au moins une promotion active apparaissent en priorité dans « Promos du moment ».",
        };
    }

    if (stats.funnel.views.current > 0 && stats.funnel.favorites.current === 0) {
        return {
            emoji: "💡",
            text: "Des gens voient votre boutique mais ne mettent rien en favori. Essayez d'ajouter des descriptions plus détaillées à vos produits.",
        };
    }

    if (stats.funnel.views.current > (stats.funnel.views.previous || 1) * 1.2) {
        return {
            emoji: "📈",
            text: `Vos vues sont en hausse ! Continuez à garder votre stock à jour pour convertir ces visiteurs.`,
        };
    }

    if (stats.stock.lowStock > 0) {
        return {
            emoji: "📦",
            text: `${stats.stock.lowStock} produit${stats.stock.lowStock > 1 ? "s" : ""} en stock bas. Pensez à réapprovisionner pour ne pas perdre de visibilité.`,
        };
    }

    // Tip par défaut
    return {
        emoji: "✨",
        text: "Votre boutique est bien configurée. Partagez votre profil Two-Step sur vos réseaux sociaux pour attirer plus de clients.",
    };
}

export function CoachTip({ stats }: { stats: DashboardStats }) {
    const tip = generateTip(stats);

    return (
        <div className="rounded-xl border border-[var(--ts-terracotta)]/10 bg-[var(--ts-terracotta)]/5 px-5 py-4">
            <div className="flex gap-3">
                <span className="text-lg">{tip.emoji}</span>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ts-terracotta)" }}>
                        Conseil du jour
                    </p>
                    <p className="mt-1 text-sm text-primary leading-relaxed">{tip.text}</p>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/coach-tip.tsx
git commit -m "feat(dashboard): add CoachTip contextual advice component"
```

---

## Task 9: Refonte page dashboard principale

**Files:**
- Modify: `src/app/dashboard/page.tsx`

Assembler tous les widgets. L'onboarding checklist reste visible si le marchand n'a pas terminé ses 5 étapes.

- [ ] **Step 1: Réécrire la page dashboard**

```tsx
// src/app/dashboard/page.tsx
"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { useMerchant } from "@/hooks/use-merchant";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { DiscoveryFunnel } from "@/components/dashboard/discovery-funnel";
import { TwoStepScore } from "@/components/dashboard/twostep-score";
import { TodayTasks } from "@/components/dashboard/today-tasks";
import { CoachTip } from "@/components/dashboard/coach-tip";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type OnboardingStep = {
    label: string;
    description: string;
    href: string;
    cta: string;
    checked: boolean;
};

export default function DashboardPage() {
    const { merchant } = useMerchant();
    const { data: stats, isLoading: statsLoading } = useDashboardStats();
    const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[]>([]);
    const [onboardingLoading, setOnboardingLoading] = useState(true);

    // Check onboarding completion
    useEffect(() => {
        if (!merchant) return;

        async function checkOnboarding() {
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

            const steps: OnboardingStep[] = [
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
            ];

            setOnboardingSteps(steps);
            setOnboardingLoading(false);
        }

        checkOnboarding();
    }, [merchant]);

    const onboardingComplete = onboardingSteps.length > 0 && onboardingSteps.every((s) => s.checked);
    const completedSteps = onboardingSteps.filter((s) => s.checked).length;

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Bienvenue sur"
                titleAccent="Two-Step"
            />

            {onboardingLoading || statsLoading ? (
                <div className="max-w-2xl space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-24 animate-pulse rounded-xl bg-white/60" />
                    ))}
                </div>
            ) : !onboardingComplete ? (
                /* ── Onboarding not done — show checklist + score ── */
                <div className="max-w-2xl space-y-6">
                    {/* Score */}
                    {stats && <TwoStepScore score={stats.score} />}

                    {/* Checklist */}
                    <div>
                        <div className="mb-4 flex items-center justify-between">
                            <p className="text-sm text-secondary">
                                Configurez votre boutique pour être visible sur Two-Step.
                            </p>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-secondary">
                                {completedSteps}/{onboardingSteps.length}
                            </span>
                        </div>

                        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${(completedSteps / onboardingSteps.length) * 100}%`,
                                    background: "var(--ts-terracotta)",
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            {onboardingSteps.map((step, i) => (
                                <div
                                    key={step.label}
                                    className={`flex items-start gap-4 rounded-xl bg-white px-5 py-4 transition ${step.checked ? "opacity-60" : ""}`}
                                >
                                    <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                        step.checked ? "bg-[#e8f3ee] text-[#5a9474]" : "bg-gray-100 text-secondary"
                                    }`}>
                                        {step.checked ? (
                                            <svg className="size-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M2 6l3 3 5-5" />
                                            </svg>
                                        ) : i + 1}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${step.checked ? "text-tertiary line-through" : "text-primary"}`}>
                                            {step.label}
                                        </p>
                                        <p className="mt-0.5 text-xs text-tertiary">{step.description}</p>
                                    </div>
                                    {!step.checked && (
                                        <Link href={step.href} className="btn-ts shrink-0 text-xs no-underline">
                                            {step.cta}
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Coach tip */}
                    {stats && <CoachTip stats={stats} />}
                </div>
            ) : (
                /* ── Onboarding done — full living dashboard ── */
                <div className="max-w-2xl space-y-6">
                    {stats && (
                        <>
                            {/* Hero stat — chiffre motivant */}
                            <div className="rounded-xl bg-white px-6 py-6">
                                <HeroStat
                                    value={stats.funnel.views.current}
                                    label="personnes ont découvert votre boutique cette semaine"
                                    trend={
                                        stats.funnel.views.previous > 0
                                            ? Math.round(((stats.funnel.views.current - stats.funnel.views.previous) / stats.funnel.views.previous) * 100)
                                            : undefined
                                    }
                                />
                            </div>

                            {/* Score Two-Step */}
                            <TwoStepScore score={stats.score} />

                            {/* Funnel découverte */}
                            <DiscoveryFunnel
                                views={stats.funnel.views}
                                favorites={stats.funnel.favorites}
                                follows={stats.funnel.follows}
                            />

                            {/* Tâches du jour */}
                            <TodayTasks
                                stats={stats}
                                merchantHasPhoto={!!merchant?.photo_url}
                                merchantHasDescription={!!merchant?.description}
                            />

                            {/* Conseil coach */}
                            <CoachTip stats={stats} />

                            {/* Quick links */}
                            <div className="grid grid-cols-2 gap-3">
                                <QuickLink href="/dashboard/products" label="Mes produits" description={`${stats.stock.total} produits`} />
                                <QuickLink href="/dashboard/stock" label="Mon stock" description={`${stats.stock.inStock} en stock`} />
                                <QuickLink href="/dashboard/promotions" label="Mes promos" description={`${stats.activePromos} active${stats.activePromos > 1 ? "s" : ""}`} />
                                <QuickLink href="/dashboard/store" label="Ma boutique" description="Modifier mon profil" />
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    );
}

function QuickLink({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <Link href={href} className="group rounded-xl bg-white px-5 py-4 no-underline transition hover:shadow-sm">
            <p className="text-sm font-semibold text-primary group-hover:text-[var(--ts-terracotta)] transition">{label}</p>
            <p className="mt-0.5 text-xs text-tertiary">{description}</p>
        </Link>
    );
}
```

- [ ] **Step 2: Vérifier que la page compile**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx next build --no-lint 2>&1 | tail -20`

- [ ] **Step 3: Tester visuellement**

Ouvrir http://localhost:3001/dashboard et vérifier :
1. Si onboarding incomplet → checklist + score + coach tip
2. Si onboarding complet → hero stat + score + funnel + tâches + coach tip + quick links

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): transform home into living dashboard with hero stat, funnel, score, tasks and coach tip"
```

---

## Task 10: Tracking page_views côté consumer

**Files:**
- Modify: `src/app/(consumer)/shop/[id]/shop-profile.tsx`

Enregistrer une page_view quand un consommateur visite une fiche boutique.

- [ ] **Step 1: Ajouter le tracking**

Ajouter un `useEffect` au début du composant `ShopProfile` qui enregistre la vue :

```tsx
// Ajouter dans shop-profile.tsx, dans le composant ShopProfile, après les hooks existants
useEffect(() => {
    // Track page view (fire and forget)
    if (profile?.merchant_id) {
        fetch("/api/page-views", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                merchant_id: profile.merchant_id,
                page_type: "shop",
            }),
        }).catch(() => {});
    }
}, [profile?.merchant_id]);
```

- [ ] **Step 2: Créer la route API page-views**

```typescript
// src/app/api/page-views/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { merchant_id, page_type, product_id } = body;

    if (!merchant_id) {
        return NextResponse.json({ error: "merchant_id required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get viewer ID if authenticated (optional)
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("page_views").insert({
        merchant_id,
        viewer_id: user?.id ?? null,
        page_type: page_type ?? "shop",
        product_id: product_id ?? null,
    });

    return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/page-views/route.ts src/app/\(consumer\)/shop/\[id\]/shop-profile.tsx
git commit -m "feat: track page views on merchant shop profiles for discovery funnel"
```

---

## Résumé des livrables

| Task | Composant | Description |
|------|-----------|-------------|
| 1 | API `/merchants/[id]/stats` | Agrégation métriques (funnel, stock, score) |
| 2 | Migration `page_views` | Table tracking vues consumer |
| 3 | `useDashboardStats` | Hook React Query avec auto-refresh 60s |
| 4 | `HeroStat` | Chiffre animé (count-up) + trend |
| 5 | `DiscoveryFunnel` | Vues → Favoris → Abonnés |
| 6 | `TwoStepScore` | Score 0-100 avec barre de progression |
| 7 | `TodayTasks` | Max 3 tâches contextuelles prioritisées |
| 8 | `CoachTip` | Conseil du jour basé sur les données |
| 9 | `page.tsx` refonte | Assemblage de tous les widgets |
| 10 | Tracking page_views | useEffect + API route côté consumer |
