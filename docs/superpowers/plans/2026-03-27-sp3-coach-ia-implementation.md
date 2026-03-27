# SP3 Coach IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le tip unique Ollama par un système Coach IA à deux blocs (Insight + Action) avec Groq/Llama 3.3, persistance en base, et historique filtrable.

**Architecture:** API route génère 2 tips/jour/marchand via Groq, les stocke dans une table `coach_tips` Supabase. Le composant dashboard affiche 2 blocs distincts. Une page `/dashboard/tips-history` expose l'historique filtrable par catégorie.

**Tech Stack:** Next.js 16, Groq SDK + Llama 3.3 70B, Supabase (PostgreSQL), Tailwind CSS, CSS vars Two-Step.

---

## File Structure

```
src/
├── app/api/merchants/[id]/
│   ├── tips/route.ts              ← NEW (remplace tip/route.ts) — génère insight+action via Groq
│   └── tips/history/route.ts      ← NEW — historique paginé + filtrable
├── app/dashboard/
│   ├── page.tsx                   ← MODIFY — remplacer <CoachTip> par <CoachTips>
│   └── tips-history/page.tsx      ← NEW — page historique
├── components/dashboard/
│   ├── coach-tips.tsx             ← NEW (remplace coach-tip.tsx) — 2 blocs insight+action
│   └── coach-tip.tsx              ← DELETE après migration
├── hooks/
│   └── use-coach-tips.ts          ← NEW — hook fetch tips du jour
supabase/migrations/
│   └── 017_coach_tips.sql         ← NEW — table coach_tips
```

---

### Task 1: Migration Supabase — table `coach_tips`

**Files:**
- Create: `supabase/migrations/017_coach_tips.sql`

- [ ] **Step 1: Créer le fichier migration**

```sql
-- ══════════════════════════════════════
-- Migration 017: Coach IA tips
-- Two-Step — SP3 coach tips persistence
-- ══════════════════════════════════════

CREATE TABLE IF NOT EXISTS coach_tips (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('insight', 'action')),
    emoji text NOT NULL DEFAULT '💡',
    text text NOT NULL,
    category text NOT NULL CHECK (category IN ('photos', 'stock', 'promos', 'profil', 'engagement')),
    cta_label text,
    cta_href text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_coach_tips_merchant_date ON coach_tips (merchant_id, created_at DESC);
CREATE INDEX idx_coach_tips_merchant_type_date ON coach_tips (merchant_id, type, created_at DESC);

ALTER TABLE coach_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their own tips"
    ON coach_tips FOR SELECT
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Service role can insert tips"
    ON coach_tips FOR INSERT
    WITH CHECK (true);
```

- [ ] **Step 2: Appliquer la migration sur Supabase**

Run: `npx supabase db push` (ou appliquer via le dashboard Supabase SQL editor)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_coach_tips.sql
git commit -m "feat(db): add coach_tips table for SP3 coach IA persistence"
```

---

### Task 2: Installer Groq SDK et revert Ollama

**Files:**
- Modify: `package.json`
- Delete: référence Ollama dans `src/app/api/merchants/[id]/tip/route.ts`

- [ ] **Step 1: Installer groq-sdk**

Run: `npm install groq-sdk`

- [ ] **Step 2: Vérifier que GROQ_API_KEY est dans .env.local**

Vérifier que `.env.local` contient :
```
GROQ_API_KEY=gsk_... (la vraie clé)
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add groq-sdk dependency for SP3 coach IA"
```

---

### Task 3: Nouvelle API `/api/merchants/[id]/tips`

**Files:**
- Create: `src/app/api/merchants/[id]/tips/route.ts`
- Delete: `src/app/api/merchants/[id]/tip/route.ts` (ancien endpoint Ollama)

- [ ] **Step 1: Créer le nouvel endpoint**

```typescript
// src/app/api/merchants/[id]/tips/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type TipRow = {
    id: string;
    type: "insight" | "action";
    emoji: string;
    text: string;
    category: string;
    cta_label: string | null;
    cta_href: string | null;
    created_at: string;
};

// Static fallbacks by type
const FALLBACK_INSIGHT = {
    emoji: "📊",
    text: "Votre boutique est active sur Two-Step. Revenez demain pour un résumé personnalisé de votre situation.",
    category: "engagement",
};

const FALLBACK_ACTION = {
    emoji: "✨",
    text: "Gardez votre stock à jour et ajoutez des photos pour attirer plus de clients dans votre quartier.",
    category: "photos",
    cta: null,
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    // Auth check
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().slice(0, 10);

    // Check DB cache — do we already have tips for today?
    const { data: existing } = await supabase
        .from("coach_tips")
        .select("*")
        .eq("merchant_id", id)
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: false })
        .limit(2);

    if (existing && existing.length === 2) {
        const insight = existing.find((t: TipRow) => t.type === "insight");
        const action = existing.find((t: TipRow) => t.type === "action");
        if (insight && action) {
            return NextResponse.json({
                insight: { emoji: insight.emoji, text: insight.text, category: insight.category },
                action: {
                    emoji: action.emoji,
                    text: action.text,
                    category: action.category,
                    cta: action.cta_label ? { label: action.cta_label, href: action.cta_href } : null,
                },
            }, { headers: { "Cache-Control": "private, max-age=3600" } });
        }
    }

    // Fetch stats for context
    const statsRes = await fetch(`${request.nextUrl.origin}/api/merchants/${id}/stats`, {
        headers: { cookie: request.headers.get("cookie") ?? "" },
    });

    if (!statsRes.ok) {
        return NextResponse.json({
            insight: FALLBACK_INSIGHT,
            action: FALLBACK_ACTION,
        });
    }

    const stats = await statsRes.json();

    // Fetch merchant profile
    const { data: merchant } = await supabase
        .from("merchants")
        .select("name, description, photo_url")
        .eq("id", id)
        .single();

    // Build prompt — single call generates both tips
    const prompt = `Tu es un coach business bienveillant pour des commerçants locaux à Toulouse qui utilisent Two-Step (une app qui rend leur stock visible aux consommateurs du quartier).

Voici les données du marchand "${merchant?.name || "ce marchand"}" cette semaine :
- Vues boutique : ${stats.funnel.views.current} (semaine dernière : ${stats.funnel.views.previous})
- Favoris reçus : ${stats.funnel.favorites.current} (semaine dernière : ${stats.funnel.favorites.previous})
- Abonnés : ${stats.funnel.follows.total}
- Produits total : ${stats.stock.total}
- En stock : ${stats.stock.inStock}
- Stock bas (≤3) : ${stats.stock.lowStock}
- Ruptures : ${stats.stock.outOfStock}
- Avec photo : ${stats.stock.withPhoto}
- Promos actives : ${stats.activePromos}
- Score Two-Step : ${stats.score}/100
${merchant?.photo_url ? "- A une photo de boutique" : "- Pas de photo de boutique"}
${merchant?.description ? "- A une description" : "- Pas de description"}

Génère EXACTEMENT un JSON avec deux tips :
1. Un "insight" : constat analytique sur la situation du marchand (ce qui se passe, tendances, chiffres clés). Ton descriptif.
2. Une "action" : conseil actionnable concret. Ton prescriptif, comme un ami qui aide.

Catégories possibles : photos, stock, promos, profil, engagement.
Varie les catégories entre insight et action.

Pour l'action, si le conseil mène à une page de l'app, fournis un CTA :
- Photos manquantes → cta: {"label": "Ajouter une photo", "href": "/dashboard/products?filter=no-photo"}
- Créer promo → cta: {"label": "Créer une promo", "href": "/dashboard/promotions/new"}
- Compléter profil → cta: {"label": "Modifier ma boutique", "href": "/dashboard/store"}
- Stock à mettre à jour → cta: {"label": "Gérer le stock", "href": "/dashboard/stock"}
- Si le conseil est externe (réseaux sociaux, etc.) → cta: null

Réponds UNIQUEMENT avec le JSON, rien d'autre :
{
  "insight": {"emoji": "📊", "text": "...", "category": "..."},
  "action": {"emoji": "💡", "text": "...", "category": "...", "cta": {"label": "...", "href": "..."} | null}
}`;

    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 400,
            temperature: 0.7,
            response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? "";
        const parsed = JSON.parse(raw);

        const insight = {
            emoji: parsed.insight?.emoji || "📊",
            text: parsed.insight?.text || FALLBACK_INSIGHT.text,
            category: parsed.insight?.category || "engagement",
        };

        const action = {
            emoji: parsed.action?.emoji || "💡",
            text: parsed.action?.text || FALLBACK_ACTION.text,
            category: parsed.action?.category || "photos",
            cta: parsed.action?.cta || null,
        };

        // Persist to DB
        await supabase.from("coach_tips").insert([
            { merchant_id: id, type: "insight", emoji: insight.emoji, text: insight.text, category: insight.category },
            {
                merchant_id: id, type: "action", emoji: action.emoji, text: action.text,
                category: action.category, cta_label: action.cta?.label ?? null, cta_href: action.cta?.href ?? null,
            },
        ]);

        return NextResponse.json({ insight, action }, {
            headers: { "Cache-Control": "private, max-age=3600" },
        });
    } catch {
        return NextResponse.json({
            insight: FALLBACK_INSIGHT,
            action: FALLBACK_ACTION,
        });
    }
}
```

- [ ] **Step 2: Supprimer l'ancien endpoint**

```bash
rm src/app/api/merchants/[id]/tip/route.ts
```

- [ ] **Step 3: Vérifier que le serveur compile**

Run: Ouvrir `http://localhost:3001/api/merchants/test/tips` — doit retourner 401 (pas authentifié).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/merchants/[id]/tips/route.ts
git rm src/app/api/merchants/[id]/tip/route.ts
git commit -m "feat(api): SP3 coach IA — dual tips endpoint via Groq/Llama 3.3 with DB persistence"
```

---

### Task 4: API historique `/api/merchants/[id]/tips/history`

**Files:**
- Create: `src/app/api/merchants/[id]/tips/history/route.ts`

- [ ] **Step 1: Créer l'endpoint historique**

```typescript
// src/app/api/merchants/[id]/tips/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PER_PAGE = 20;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    // Auth check
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const offset = (page - 1) * PER_PAGE;

    // Build query
    let query = supabase
        .from("coach_tips")
        .select("id, type, emoji, text, category, cta_label, cta_href, created_at", { count: "exact" })
        .eq("merchant_id", id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PER_PAGE - 1);

    if (category) {
        query = query.eq("category", category);
    }

    const { data: tips, count, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        tips: (tips ?? []).map((t) => ({
            id: t.id,
            type: t.type,
            emoji: t.emoji,
            text: t.text,
            category: t.category,
            cta: t.cta_label ? { label: t.cta_label, href: t.cta_href } : null,
            created_at: t.created_at,
        })),
        total: count ?? 0,
        page,
        per_page: PER_PAGE,
    }, { headers: { "Cache-Control": "private, max-age=60" } });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/merchants/[id]/tips/history/route.ts
git commit -m "feat(api): SP3 coach IA — tips history endpoint with category filter and pagination"
```

---

### Task 5: Hook `useCoachTips`

**Files:**
- Create: `src/hooks/use-coach-tips.ts`

- [ ] **Step 1: Créer le hook**

```typescript
// src/hooks/use-coach-tips.ts
"use client";

import { useEffect, useState } from "react";
import { useMerchant } from "@/hooks/use-merchant";

type Cta = { label: string; href: string };

export type CoachTip = {
    emoji: string;
    text: string;
    category: string;
    cta?: Cta | null;
};

export type CoachTipsData = {
    insight: CoachTip;
    action: CoachTip;
};

export function useCoachTips() {
    const { merchant } = useMerchant();
    const [data, setData] = useState<CoachTipsData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!merchant?.id) return;

        setLoading(true);
        fetch(`/api/merchants/${merchant.id}/tips`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (json?.insight && json?.action) setData(json);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [merchant?.id]);

    return { data, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-coach-tips.ts
git commit -m "feat: add useCoachTips hook for SP3 dual tips fetching"
```

---

### Task 6: Composant `CoachTips` (2 blocs)

**Files:**
- Create: `src/components/dashboard/coach-tips.tsx`
- Delete: `src/components/dashboard/coach-tip.tsx` (ancien composant)

- [ ] **Step 1: Créer le nouveau composant**

```tsx
// src/components/dashboard/coach-tips.tsx
"use client";

import Link from "next/link";
import type { CoachTipsData } from "@/hooks/use-coach-tips";

const CATEGORY_LABELS: Record<string, string> = {
    photos: "📸 Photos",
    stock: "📦 Stock",
    promos: "🏷️ Promos",
    profil: "🏪 Profil",
    engagement: "📈 Engagement",
};

function CategoryBadge({ category }: { category: string }) {
    return (
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "var(--ts-cream)", color: "#5a4020" }}>
            {CATEGORY_LABELS[category] || category}
        </span>
    );
}

function InsightCard({ tip }: { tip: CoachTipsData["insight"] }) {
    return (
        <div className="relative overflow-hidden rounded-xl border border-[#e8e2d4] bg-white px-5 py-5">
            <div className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: "linear-gradient(90deg, var(--ts-ochre, #C8813A), var(--ts-terracotta, #E07A5F))" }} />
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{tip.emoji}</span>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ts-ochre, #C8813A)" }}>
                    Votre situation
                </span>
            </div>
            <p className="text-sm leading-relaxed text-[#2c1a0e]">{tip.text}</p>
            <div className="mt-3 flex justify-end">
                <CategoryBadge category={tip.category} />
            </div>
        </div>
    );
}

function ActionCard({ tip }: { tip: CoachTipsData["action"] }) {
    return (
        <div className="relative overflow-hidden rounded-xl border border-[#e8e2d4] bg-white px-5 py-5">
            <div className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: "linear-gradient(90deg, var(--ts-terracotta, #E07A5F), #e8956e)" }} />
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{tip.emoji}</span>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ts-terracotta, #E07A5F)" }}>
                    Action du jour
                </span>
            </div>
            <p className="text-sm leading-relaxed text-[#2c1a0e]">{tip.text}</p>
            {tip.cta && (
                <Link href={tip.cta.href}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
                    style={{ background: "var(--ts-terracotta, #E07A5F)" }}>
                    {tip.cta.label} <span>→</span>
                </Link>
            )}
            <div className="mt-3 flex justify-end">
                <CategoryBadge category={tip.category} />
            </div>
        </div>
    );
}

export function CoachTips({ data, loading }: { data: CoachTipsData | null; loading: boolean }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <div className="animate-pulse rounded-xl bg-white/60 h-28" />
                <div className="animate-pulse rounded-xl bg-white/60 h-32" />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-3">
            <InsightCard tip={data.insight} />
            <ActionCard tip={data.action} />
            <div className="flex justify-center pt-1">
                <Link href="/dashboard/tips-history"
                    className="text-[13px] text-[#8a7050] transition hover:text-[var(--ts-terracotta)]">
                    Voir l'historique des conseils →
                </Link>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Supprimer l'ancien composant**

```bash
rm src/components/dashboard/coach-tip.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/coach-tips.tsx
git rm src/components/dashboard/coach-tip.tsx
git commit -m "feat(dashboard): SP3 coach IA — dual tips component (insight + action with CTA)"
```

---

### Task 7: Intégrer `CoachTips` dans le dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Mettre à jour les imports**

Remplacer :
```typescript
import { CoachTip } from "@/components/dashboard/coach-tip";
```
Par :
```typescript
import { CoachTips } from "@/components/dashboard/coach-tips";
import { useCoachTips } from "@/hooks/use-coach-tips";
```

- [ ] **Step 2: Ajouter le hook dans le composant**

Dans `DashboardPage()`, après la ligne `const { data: stats, loading: statsLoading } = useDashboardStats();`, ajouter :
```typescript
const { data: tips, loading: tipsLoading } = useCoachTips();
```

- [ ] **Step 3: Remplacer les deux blocs CoachTip**

Remplacer le bloc Coach tip en mode onboarding (lignes ~198-203) :
```tsx
{/* Coach tips */}
<CoachTips data={tips} loading={tipsLoading} />
```

Remplacer le bloc Coach tip en mode complet (lignes ~246-251) :
```tsx
{/* Coach tips */}
<CoachTips data={tips} loading={tipsLoading} />
```

- [ ] **Step 4: Vérifier le rendu**

Ouvrir `http://localhost:3001/dashboard` — les deux blocs Insight + Action doivent apparaître avec le style du mockup.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): integrate CoachTips dual blocks into dashboard home"
```

---

### Task 8: Page historique `/dashboard/tips-history`

**Files:**
- Create: `src/app/dashboard/tips-history/page.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// src/app/dashboard/tips-history/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMerchant } from "@/hooks/use-merchant";

const CATEGORIES = [
    { value: "", label: "Tous" },
    { value: "photos", label: "📸 Photos" },
    { value: "stock", label: "📦 Stock" },
    { value: "promos", label: "🏷️ Promos" },
    { value: "profil", label: "🏪 Profil" },
    { value: "engagement", label: "📈 Engagement" },
];

type Tip = {
    id: string;
    type: "insight" | "action";
    emoji: string;
    text: string;
    category: string;
    cta: { label: string; href: string } | null;
    created_at: string;
};

export default function TipsHistoryPage() {
    const { merchant } = useMerchant();
    const [tips, setTips] = useState<Tip[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [category, setCategory] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!merchant?.id) return;
        setLoading(true);

        const params = new URLSearchParams({ page: String(page) });
        if (category) params.set("category", category);

        fetch(`/api/merchants/${merchant.id}/tips/history?${params}`)
            .then((res) => res.json())
            .then((data) => {
                setTips(data.tips ?? []);
                setTotal(data.total ?? 0);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [merchant?.id, page, category]);

    const totalPages = Math.ceil(total / 20);

    function formatDate(iso: string) {
        const d = new Date(iso);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return "Hier";
        return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-6">
            <div className="mb-6">
                <Link href="/dashboard" className="text-sm text-[#8a7050] hover:text-[var(--ts-terracotta)]">
                    ← Retour au dashboard
                </Link>
                <h1 className="mt-2 text-lg font-semibold text-[#2c1a0e]">Historique des conseils</h1>
                <p className="text-sm text-[#5a4020]">{total} conseil{total > 1 ? "s" : ""} au total</p>
            </div>

            {/* Filters */}
            <div className="mb-5 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                    <button key={cat.value}
                        onClick={() => { setCategory(cat.value); setPage(1); }}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                            category === cat.value
                                ? "border-[var(--ts-ochre)] bg-[var(--ts-ochre)] text-white"
                                : "border-[#e8e2d4] bg-white text-[#5a4020] hover:border-[var(--ts-ochre)] hover:text-[var(--ts-ochre)]"
                        }`}>
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Tips list */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="animate-pulse rounded-lg bg-white/60 h-20" />
                    ))}
                </div>
            ) : tips.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#8a7050]">Aucun conseil pour le moment.</p>
            ) : (
                <div className="space-y-0 divide-y divide-[#f0ebe0]">
                    {tips.map((tip) => (
                        <div key={tip.id} className="flex gap-3 py-4">
                            <div className="min-w-[60px] pt-0.5 text-[11px] text-[#8a7050]">
                                {formatDate(tip.created_at)}
                            </div>
                            <div className="flex-1">
                                <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    tip.type === "insight"
                                        ? "bg-[#f0e8d0] text-[var(--ts-ochre)]"
                                        : "bg-[#fce8e2] text-[var(--ts-terracotta)]"
                                }`}>
                                    {tip.emoji} {tip.type === "insight" ? "Insight" : "Action"}
                                </span>
                                <p className="mt-1 text-[13px] leading-relaxed text-[#2c1a0e]">{tip.text}</p>
                                <p className="mt-1 text-[11px] text-[#8a7050]">
                                    {CATEGORIES.find((c) => c.value === tip.category)?.label || tip.category}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="rounded-lg border border-[#e8e2d4] px-3 py-1.5 text-xs text-[#5a4020] disabled:opacity-40">
                        ← Précédent
                    </button>
                    <span className="text-xs text-[#8a7050]">{page} / {totalPages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded-lg border border-[#e8e2d4] px-3 py-1.5 text-xs text-[#5a4020] disabled:opacity-40">
                        Suivant →
                    </button>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Vérifier le rendu**

Ouvrir `http://localhost:3001/dashboard/tips-history` — doit afficher la page avec filtres et liste vide (pas encore de tips en base).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/tips-history/page.tsx
git commit -m "feat(dashboard): SP3 coach IA — tips history page with category filters and pagination"
```

---

### Task 9: Vérification finale

- [ ] **Step 1: Vérifier la compilation**

Run: `npm run build` (ou vérifier que le dev server n'a pas d'erreurs)

- [ ] **Step 2: Test fonctionnel**

1. Ouvrir le dashboard → les 2 blocs tips doivent apparaître (fallback statique si pas de GROQ_API_KEY valide)
2. Si GROQ_API_KEY configurée → tips IA générés, persistés en base
3. Cliquer "Voir l'historique" → page historique avec les tips
4. Filtrer par catégorie → la liste se met à jour
5. Le bouton CTA sur l'Action doit mener à la bonne page

- [ ] **Step 3: Nettoyage**

```bash
# Supprimer la dépendance ollama si présente
npm uninstall ollama 2>/dev/null
```

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore: SP3 coach IA cleanup — remove ollama dependency"
```
