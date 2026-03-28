# Follows Instagram-like + Suggestions d'amélioration — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopter les patterns Instagram (bouton S'abonner, toggle Pour toi/Suivis), simplifier les Favoris (produits only), et ajouter un système de suggestions d'amélioration privées filtrées par IA.

**Architecture:** 4 changements indépendants : (1) toggle Pour toi/Suivis sur Discover, (2) bouton S'abonner sur page boutique, (3) simplification page Favoris, (4) suggestions d'amélioration avec filtrage Groq. Pas de nouvelle dépendance, 1 nouvelle table, 1 nouvelle route API.

**Tech Stack:** Next.js 16, Tailwind v4, vaul (Drawer), Groq Cloud (Llama 3.3), Supabase, React Query.

---

## File Structure

| Action | File | Responsabilité |
|--------|------|----------------|
| Modify | `src/app/(consumer)/discover/page.tsx` | Ajouter toggle Pour toi / Suivis + vue Suivis |
| Modify | `src/app/(consumer)/shop/[id]/shop-profile.tsx` | Remplacer coeur par bouton S'abonner + ajouter suggestion |
| Modify | `src/app/(consumer)/favorites/page.tsx` | Retirer onglet Boutiques, garder produits only |
| Create | `src/app/(consumer)/components/suggestion-drawer.tsx` | Bottom sheet suggestion d'amélioration |
| Create | `src/app/api/suggestions/route.ts` | POST suggestion avec filtrage IA Groq |
| Create | `supabase/migrations/022_suggestions.sql` | Table suggestions |
| Modify | `src/app/dashboard/page.tsx` | Widget dernières suggestions |

---

### Task 1: Migration Supabase — table suggestions

**Files:**
- Create: `supabase/migrations/022_suggestions.sql`

- [ ] **Step 1: Écrire la migration**

```sql
create table public.suggestions (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    consumer_id uuid references auth.users(id) on delete set null,
    text text not null,
    original_text text,
    status text not null default 'visible' check (status in ('visible', 'archived')),
    created_at timestamptz not null default now()
);

alter table public.suggestions enable row level security;

create policy "Merchants read own suggestions"
    on suggestions for select
    using (merchant_id in (select id from merchants where user_id = auth.uid()));

create policy "Authenticated users can insert suggestions"
    on suggestions for insert
    with check (auth.uid() is not null);

create policy "Merchants can update own suggestions"
    on suggestions for update
    using (merchant_id in (select id from merchants where user_id = auth.uid()))
    with check (merchant_id in (select id from merchants where user_id = auth.uid()));
```

- [ ] **Step 2: Appliquer la migration**

```bash
cd twostep-nextjs && npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/022_suggestions.sql
git commit -m "feat: add suggestions table with RLS policies"
```

---

### Task 2: API route suggestions — filtrage IA Groq

**Files:**
- Create: `src/app/api/suggestions/route.ts`

- [ ] **Step 1: Écrire la route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Tu es un filtre de suggestions pour des boutiques locales.
Tu reçois un message d'un consommateur destiné au marchand.

Règles :
- Si le message est constructif, bienveillant et contient un axe d'amélioration concret → réponds "pass"
- Si le message est insultant, méchant, vulgaire, moqueur ou sans fond constructif → réponds "reject"
- Si le message a un fond valide mais un ton négatif → reformule-le de façon bienveillante et constructive, en gardant le sens. Réponds "rewrite:" suivi de ta version.

Réponds UNIQUEMENT "pass", "reject", ou "rewrite: [texte reformulé]". Rien d'autre.`;

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const body = await req.json();
    const { merchant_id, text } = body;

    if (!merchant_id || !text || typeof text !== "string") {
        return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
        return NextResponse.json({ error: "Message entre 1 et 500 caractères" }, { status: 400 });
    }

    // Rate limit: max 3 suggestions per consumer per merchant per day
    const { count } = await supabase
        .from("suggestions")
        .select("id", { count: "exact", head: true })
        .eq("consumer_id", user.id)
        .eq("merchant_id", merchant_id)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString());

    if ((count ?? 0) >= 3) {
        // Silently accept — don't reveal rate limit
        return NextResponse.json({ ok: true });
    }

    // AI filtering via Groq
    let verdict = "pass";
    let rewrittenText: string | null = null;

    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: trimmed },
            ],
            temperature: 0.1,
            max_tokens: 300,
        });

        const response = completion.choices[0]?.message?.content?.trim() ?? "pass";

        if (response === "reject") {
            verdict = "reject";
        } else if (response.startsWith("rewrite:")) {
            verdict = "rewrite";
            rewrittenText = response.slice("rewrite:".length).trim();
        }
    } catch {
        // If Groq fails, let it through (fail open)
        verdict = "pass";
    }

    // Reject silently — consumer always sees "Merci"
    if (verdict === "reject") {
        return NextResponse.json({ ok: true });
    }

    // Store suggestion
    await supabase.from("suggestions").insert({
        merchant_id,
        consumer_id: user.id,
        text: verdict === "rewrite" ? rewrittenText : trimmed,
        original_text: verdict === "rewrite" ? trimmed : null,
    });

    return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/suggestions/route.ts
git commit -m "feat: add suggestions API with Groq AI filtering"
```

---

### Task 3: Discover page — toggle Pour toi / Suivis

**Files:**
- Modify: `src/app/(consumer)/discover/page.tsx`

- [ ] **Step 1: Ajouter le state du toggle**

Après la ligne `const hasActiveSizeFilter = ...` (ligne 69), ajouter :

```typescript
const [feedTab, setFeedTab] = useState<"pour-toi" | "suivis">("pour-toi");
```

- [ ] **Step 2: Ajouter le toggle pill après le header**

Après la fermeture de `</AnimatePresence>` et `</div>` du header (ligne 238), avant le commentaire `{/* ── Feed sections ── */}`, insérer :

```tsx
            {/* ── Pour toi / Suivis toggle ── */}
            <div className="mt-3 flex justify-center px-4">
                <div className="flex rounded-full p-1" style={{ background: "#2a1a08" }}>
                    <button
                        type="button"
                        onClick={() => setFeedTab("pour-toi")}
                        className={cx(
                            "rounded-full px-5 py-2 text-sm font-semibold transition duration-150",
                            feedTab === "pour-toi" ? "bg-[#C17B2F] text-white" : "text-[#f0dfc0]/50",
                        )}
                    >
                        Pour toi
                    </button>
                    <button
                        type="button"
                        onClick={() => setFeedTab("suivis")}
                        className={cx(
                            "rounded-full px-5 py-2 text-sm font-semibold transition duration-150",
                            feedTab === "suivis" ? "bg-[#C17B2F] text-white" : "text-[#f0dfc0]/50",
                        )}
                    >
                        Suivis
                    </button>
                </div>
            </div>
```

- [ ] **Step 3: Wrapper conditionnel autour du feed existant**

Entourer le bloc `{/* ── Feed sections ── */}` existant (ligne 240+) avec :

```tsx
            {feedTab === "pour-toi" ? (
                {/* ── Feed sections existant (inchangé) ── */}
                <div className="flex flex-col gap-5 pb-24 pt-4">
                    {/* ... tout le contenu actuel du feed ... */}
                </div>
            ) : (
                {/* ── Suivis ── */}
                <FollowedShopsList follows={follows} position={position} />
            )}
```

- [ ] **Step 4: Écrire le composant FollowedShopsList en bas du fichier**

```tsx
function FollowedShopsList({ follows, position }: { follows: any[] | undefined; position: { lat: number; lng: number } | null }) {
    if (!follows || follows.length === 0) {
        return (
            <div className="flex flex-col items-center px-6 pb-24 pt-12 text-center">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-[#2a1a08] text-2xl">🏪</div>
                <p className="mt-4 text-[15px] font-semibold text-[#f0dfc0]">Aucune boutique suivie</p>
                <p className="mt-1.5 text-[13px] text-[#5a4020]">
                    Abonne-toi à des boutiques pour les retrouver ici.
                </p>
                <Link
                    href="/explore"
                    className="mt-4 rounded-full bg-[#c87830] px-5 py-2.5 text-sm font-semibold text-white transition active:opacity-80"
                >
                    Explorer les boutiques
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-2 px-4 pb-24 pt-4">
            {follows.map((f: any) => {
                const merchant = f.merchants;
                if (!merchant) return null;
                return (
                    <Link
                        key={f.merchant_id}
                        href={`/shop/${generateSlug(merchant.name || "", f.merchant_id)}`}
                        className="flex items-center gap-3 rounded-2xl bg-[#2a1a08] p-3 transition duration-150 active:scale-[0.98]"
                    >
                        <div className="size-13 shrink-0 overflow-hidden rounded-full bg-[#1C1209]">
                            {merchant.photo_url ? (
                                <img src={merchant.photo_url} alt={merchant.name} className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full items-center justify-center text-lg font-bold text-[#c87830]">
                                    {merchant.name?.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-[13px] font-medium text-[#f5deb3]">{merchant.name}</h3>
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#5a4020]">
                                <MarkerPin01 className="size-3" aria-hidden="true" />
                                {merchant.city}
                            </p>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(consumer)/discover/page.tsx
git commit -m "feat: add Pour toi / Suivis toggle on Discover page"
```

---

### Task 4: Page boutique — bouton S'abonner + suggestion

**Files:**
- Modify: `src/app/(consumer)/shop/[id]/shop-profile.tsx`
- Create: `src/app/(consumer)/components/suggestion-drawer.tsx`

- [ ] **Step 1: Créer le composant SuggestionDrawer**

```typescript
"use client";

import { useState } from "react";
import { Drawer } from "vaul";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    merchantId: string;
};

export function SuggestionDrawer({ open, onOpenChange, merchantId }: Props) {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async () => {
        if (!text.trim() || sending) return;
        setSending(true);
        try {
            await fetch("/api/suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchant_id: merchantId, text: text.trim() }),
            });
            setSent(true);
            setTimeout(() => {
                onOpenChange(false);
                setSent(false);
                setText("");
            }, 1500);
        } catch {
            // Silent fail
        } finally {
            setSending(false);
        }
    };

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl bg-[var(--ts-cream)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[var(--ts-brown-mid)]/20" />
                    <div className="p-5 pb-6">
                        {sent ? (
                            <div className="py-8 text-center">
                                <div className="text-3xl">🙏</div>
                                <p className="mt-2 text-sm font-semibold text-[var(--ts-brown)]">Merci pour votre suggestion !</p>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-[15px] font-semibold text-[var(--ts-brown)]">
                                    Aidez cette boutique à s&apos;améliorer
                                </h3>
                                <p className="mt-1 text-xs text-[var(--ts-brown-mid)]/60">
                                    Votre message est privé et sera relu avant d&apos;être transmis.
                                </p>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value.slice(0, 500))}
                                    placeholder="Ex : Ce serait super d'avoir plus de photos des produits…"
                                    className="mt-3 w-full rounded-xl border border-[var(--ts-cream-dark)] bg-white px-4 py-3 text-sm text-[var(--ts-brown)] placeholder:text-[var(--ts-brown-mid)]/30 focus:border-[var(--ts-ochre)] focus:outline-none"
                                    rows={3}
                                />
                                <div className="mt-1 text-right text-[10px] text-[var(--ts-brown-mid)]/40">
                                    {text.length}/500
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={!text.trim() || sending}
                                    className="mt-3 w-full rounded-xl bg-[var(--ts-ochre)] py-3 text-sm font-semibold text-white transition active:opacity-80 disabled:opacity-40"
                                >
                                    {sending ? "Envoi…" : "Envoyer"}
                                </button>
                            </>
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
```

- [ ] **Step 2: Modifier shop-profile.tsx — retirer le coeur, ajouter S'abonner**

Dans `shop-profile.tsx`, supprimer le bloc du bouton coeur (lignes ~160-174) :

```tsx
                {/* Heart button — circle, top-right like TGTG */}
                <button
                    type="button"
                    onClick={() => merchantUuid && (isFollowing ? unfollow.mutate(merchantUuid) : follow.mutate(merchantUuid))}
                    ...
                </button>
```

Puis, dans la zone info sous le cover (après la ligne stats `abonnés · produits`, vers ligne 230-233), ajouter le bouton S'abonner :

```tsx
                {/* S'abonner button — Instagram style */}
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => merchantUuid && (isFollowing ? unfollow.mutate(merchantUuid) : follow.mutate(merchantUuid))}
                        className={cx(
                            "flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition duration-150 active:scale-[0.97]",
                            isFollowing
                                ? "border border-[var(--ts-brown-mid)]/15 bg-[var(--ts-cream-dark)] text-[var(--ts-brown-mid)]/70"
                                : "bg-[var(--ts-ochre)] text-white",
                        )}
                    >
                        {isFollowing ? "Abonné ✓" : "S'abonner"}
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            const url = window.location.href;
                            if (navigator.share) {
                                try { await navigator.share({ title: profile.merchant_name, text: `Découvre ${profile.merchant_name} sur Two-Step`, url }); } catch {}
                            } else {
                                await navigator.clipboard.writeText(url);
                            }
                        }}
                        className="flex size-10 items-center justify-center rounded-lg border border-[var(--ts-brown-mid)]/15 bg-[var(--ts-cream-dark)] transition active:scale-[0.97]"
                    >
                        <Share07 className="size-4 text-[var(--ts-brown-mid)]" />
                    </button>
                </div>
```

- [ ] **Step 3: Ajouter le bouton suggestion et le drawer en bas de page**

Ajouter un state et l'import en haut du composant :

```typescript
import { SuggestionDrawer } from "../../components/suggestion-drawer";
// Dans le composant :
const [suggestionOpen, setSuggestionOpen] = useState(false);
```

Après le grid produits (après `</div>` fermant du grid, vers ligne 367), ajouter :

```tsx
            {/* Suggestion button */}
            {merchantUuid && (
                <div className="px-4 pb-24 pt-2">
                    <button
                        type="button"
                        onClick={() => setSuggestionOpen(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--ts-cream-dark)] bg-[var(--ts-cream)] py-3 text-xs font-medium text-[var(--ts-brown-mid)]/60 transition active:bg-[var(--ts-cream-dark)]"
                    >
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Suggérer une amélioration
                    </button>
                    <SuggestionDrawer open={suggestionOpen} onOpenChange={setSuggestionOpen} merchantId={merchantUuid} />
                </div>
            )}
```

- [ ] **Step 4: Retirer le bouton Share du cover**

Supprimer le bouton Share flottant dans le cover (lignes ~177-192) puisqu'il est maintenant intégré dans la row S'abonner.

- [ ] **Step 5: Commit**

```bash
git add src/app/(consumer)/components/suggestion-drawer.tsx src/app/(consumer)/shop/[id]/shop-profile.tsx
git commit -m "feat: Instagram-like subscribe button + suggestion drawer on shop page"
```

---

### Task 5: Page Favoris — produits uniquement

**Files:**
- Modify: `src/app/(consumer)/favorites/page.tsx`

- [ ] **Step 1: Simplifier le composant**

Retirer les imports et hooks follows :

```typescript
// RETIRER ces imports :
import { useFollows, useToggleFollow } from "../hooks/use-follows";
// RETIRER dans le composant :
const { data: follows, isLoading: loadingFollows } = useFollows();
const { unfollow } = useToggleFollow();
```

Retirer le state tabs :

```typescript
// RETIRER :
type Tab = "produits" | "boutiques";
const [activeTab, setActiveTab] = useState<Tab>("produits");
```

- [ ] **Step 2: Retirer le header avec tabs**

Remplacer le header avec les deux tabs par un header simple :

```tsx
            {/* Header */}
            <div className="bg-[#1C1209]" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-center gap-2.5 px-4 pb-4">
                    <img src="/logo-icon.webp" alt="" className="size-7" />
                    <h1 className="font-display text-xl font-bold text-[#f5deb3]">Favoris</h1>
                    {favorites && favorites.length > 0 && (
                        <span className="rounded-full bg-[#2a1a08] px-2 py-0.5 text-[10px] font-semibold text-[#a07840]">
                            {favorites.length}
                        </span>
                    )}
                </div>
            </div>
```

- [ ] **Step 3: Retirer le rendu conditionnel par tab**

Retirer le bloc `{activeTab === "boutiques" && (...)}` entier.
Retirer le wrapper `{activeTab === "produits" && (...)}` — garder seulement le contenu produits directement.

- [ ] **Step 4: Adapter l'empty state**

Dans `EmptyStateWithSuggestions`, retirer le prop `tab` et adapter le texte :

```tsx
function EmptyStateWithSuggestions() {
```

Changer le sous-titre :

```tsx
<p className="mt-2 text-[13px] leading-relaxed text-[#5a4020]">
    Appuie sur ♡ sur un produit pour le sauvegarder ici.
</p>
```

Retirer la section "Boutiques ouvertes maintenant" de l'empty state (les shops) — garder uniquement les suggestions produits.

- [ ] **Step 5: Commit**

```bash
git add src/app/(consumer)/favorites/page.tsx
git commit -m "refactor: simplify favorites page — products only, no shop tabs"
```

---

### Task 6: Widget suggestions sur dashboard marchand

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Ajouter le fetch suggestions dans le composant**

Après les hooks existants (useCoachTips, useAchievements), ajouter :

```typescript
const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; created_at: string }>>([]);

useEffect(() => {
    if (!merchant) return;
    async function loadSuggestions() {
        const supabase = createClient();
        const { data } = await supabase
            .from("suggestions")
            .select("id, text, created_at")
            .eq("merchant_id", merchant!.id)
            .eq("status", "visible")
            .order("created_at", { ascending: false })
            .limit(3);
        if (data) setSuggestions(data);
    }
    loadSuggestions();
}, [merchant]);
```

- [ ] **Step 2: Ajouter le widget dans le Mode B (après coach tips + trophées)**

Après la row tips + trophées (le `</div>` du grid `lg:grid-cols-2` contenant CoachTips et AchievementWidget), ajouter :

```tsx
                    {/* Suggestions widget */}
                    {suggestions.length > 0 && (
                        <div className="rounded-xl bg-white px-5 py-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                                Suggestions de vos clients
                            </h3>
                            <div className="mt-3 space-y-2.5">
                                {suggestions.map((s) => (
                                    <div key={s.id} className="flex gap-3 rounded-lg bg-gray-50 px-3.5 py-2.5">
                                        <span className="mt-0.5 text-sm">💬</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs text-gray-700 leading-relaxed">{s.text}</p>
                                            <p className="mt-1 text-[10px] text-gray-400">
                                                {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add suggestions widget on merchant dashboard"
```

---

### Task 7: Vérification TypeScript + build

- [ ] **Step 1: Vérifier TypeScript**

```bash
cd twostep-nextjs && npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 2: Build production**

```bash
cd twostep-nextjs && npx next build
```

Expected: build réussi.

- [ ] **Step 3: Commit final si fixes nécessaires**

```bash
git add -A src/ supabase/
git commit -m "fix: resolve any type errors from follows + suggestions implementation"
```
