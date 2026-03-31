# Two-Step Phase 2 — Navigation & UX Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure la navigation consumer (4 onglets, header TikTok avec swipe, stories supprimées), unifie les catégories, ajoute les liens sociaux sur la fiche boutique, fusionne Produits+Stock dans le dashboard, et réordonne l'onboarding marchand.

**Architecture:** Le discover/page.tsx actuel contient déjà les 3 sous-tabs (explorer/pour-toi/suivis) via query params. On transforme le header actuel en vrai header TikTok-style avec indicateur animé et swipe horizontal (react-swipeable). La bottom nav passe de 4 à 4 onglets mais avec des noms/icons différents. Les catégories sont extraites dans un fichier partagé. Les stories sont supprimées partout (frontend + migration DB). Le dashboard fusionne products+stock en une seule page.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4.1, motion (Framer Motion), react-swipeable (à installer), Supabase (migrations SQL), @untitledui/icons

**Inspirations concurrents (valeurs exactes à utiliser) :**
- Animations spring : `{ type: "spring", stiffness: 200, damping: 30 }` (Frameship)
- Transitions hover : `transition duration-100 ease-linear` (Instagram)
- Tab indicator : `role="tablist"` + `aria-selected` + underline via motion.span layoutId (Instagram)
- Skeletons : dimensions fixes, stagger `calc(N × 200ms)` (Instagram/Vinted)

---

## File Map

| Action | Fichier | Responsabilité |
|--------|---------|---------------|
| Create | `src/lib/categories.ts` | Source unique des catégories consumer |
| Create | `src/app/(consumer)/components/feed-header.tsx` | Header TikTok 3 onglets avec swipe |
| Create | `src/app/(consumer)/components/feed-skeleton.tsx` | Skeletons pour les 3 feeds |
| Create | `supabase/migrations/039_drop_stories.sql` | Suppression table + bucket stories |
| Create | `supabase/migrations/040_merchant_social_links.sql` | Colonnes instagram_url, tiktok_url, website_url |
| Modify | `src/app/(consumer)/components/tab-bar.tsx` | 4 onglets : Accueil/Recherche/Promos/Profil |
| Modify | `src/app/(consumer)/layout.tsx` | Retirer import StoryBar si présent |
| Modify | `src/app/(consumer)/discover/page.tsx` | Utiliser FeedHeader + catégories partagées, supprimer StoryBar |
| Modify | `src/app/(consumer)/explore/page.tsx` | Importer catégories depuis lib/categories |
| Modify | `src/app/(consumer)/search/page.tsx` | Importer catégories depuis lib/categories |
| Modify | `src/app/(consumer)/toulouse/[category]/page.tsx` | Importer catégories depuis lib/categories |
| Modify | `src/app/(consumer)/[city]/[category]/page.tsx` | Importer catégories depuis lib/categories |
| Modify | `src/app/(consumer)/shop/[id]/shop-profile.tsx` | Supprimer StoryBar, ajouter icônes sociales |
| Modify | `src/app/(consumer)/product/[id]/product-detail.tsx` | Supprimer import StoryBar si présent |
| Delete | `src/app/(consumer)/components/story-bar.tsx` | Supprimé |
| Delete | `src/app/(consumer)/components/story-viewer.tsx` | Supprimé |
| Delete | `src/app/api/stories/route.ts` | Supprimé |
| Delete | `src/app/api/stories/[id]/route.ts` | Supprimé |
| Delete | `src/app/dashboard/stories/page.tsx` | Supprimé |
| Modify | `src/components/dashboard/sidebar.tsx` | Retirer Stories + Stock de la nav |
| Modify | `src/app/dashboard/products/page.tsx` | Intégrer contrôles stock inline |
| Modify | `src/app/dashboard/page.tsx` | Réordonner les 5 étapes onboarding |
| Modify | `src/app/dashboard/settings/page.tsx` | Ajouter section liens sociaux |

---

## Task 1: Catégories partagées — Source unique

**Files:**
- Create: `src/lib/categories.ts`
- Modify: `src/app/(consumer)/discover/page.tsx:32-41`
- Modify: `src/app/(consumer)/explore/page.tsx:19-28`
- Modify: `src/app/(consumer)/search/page.tsx:15-24`
- Modify: `src/app/(consumer)/toulouse/[category]/page.tsx:10-18`
- Modify: `src/app/(consumer)/[city]/[category]/page.tsx:20-27`

- [ ] **Step 1: Créer `src/lib/categories.ts`**

```typescript
export const CONSUMER_CATEGORIES = [
    { label: "Tout", value: null, emoji: null },
    { label: "Mode", value: "mode", emoji: "👗" },
    { label: "Chaussures", value: "chaussures", emoji: "👟" },
    { label: "Bijoux", value: "bijoux", emoji: "💎" },
    { label: "Beauté", value: "beaute", emoji: "💄" },
    { label: "Sport", value: "sport", emoji: "⚽" },
    { label: "Déco", value: "deco", emoji: "🏠" },
    { label: "Épicerie", value: "epicerie", emoji: "🧺" },
] as const;

/** Mapping slug → DB category name (for SEO pages) */
export const CATEGORY_SEO: Record<string, { title: string; description: string; dbCategory: string }> = {
    mode: { title: "Mode", description: "Boutiques de mode et prêt-à-porter. Vêtements, accessoires et créateurs locaux.", dbCategory: "Mode" },
    chaussures: { title: "Chaussures", description: "Magasins de chaussures. Sneakers, boots, escarpins et chaussures artisanales.", dbCategory: "Chaussures" },
    bijoux: { title: "Bijoux", description: "Bijouteries et créateurs de bijoux. Bijoux artisanaux, fantaisie et précieux.", dbCategory: "Bijoux" },
    sport: { title: "Sport", description: "Magasins de sport. Équipements, vêtements techniques et accessoires.", dbCategory: "Sport" },
    decoration: { title: "Décoration", description: "Boutiques de décoration et design d'intérieur. Objets déco, mobilier et art de vivre.", dbCategory: "Décoration" },
    beaute: { title: "Beauté", description: "Instituts et boutiques beauté. Soins, maquillage et produits naturels.", dbCategory: "Beauté" },
    epicerie: { title: "Épicerie", description: "Épiceries fines et commerces alimentaires. Produits locaux et artisanaux.", dbCategory: "Épicerie" },
    deco: { title: "Déco", description: "Boutiques de décoration d'intérieur. Objets déco, mobilier et art de vivre.", dbCategory: "Décoration" },
};

export type CategoryValue = (typeof CONSUMER_CATEGORIES)[number]["value"];
```

- [ ] **Step 2: Remplacer dans discover/page.tsx**

Supprimer les lignes 32-41 (le bloc `const CATEGORIES = [...]`) et ajouter l'import :

```typescript
import { CONSUMER_CATEGORIES } from "@/lib/categories";
```

Puis remplacer toutes les occurrences de `CATEGORIES` par `CONSUMER_CATEGORIES` dans le fichier.

- [ ] **Step 3: Remplacer dans explore/page.tsx**

Supprimer les lignes 19-28 et ajouter :

```typescript
import { CONSUMER_CATEGORIES } from "@/lib/categories";
```

Remplacer `CATEGORIES` par `CONSUMER_CATEGORIES`.

- [ ] **Step 4: Remplacer dans search/page.tsx**

Supprimer les lignes 15-24 et ajouter :

```typescript
import { CONSUMER_CATEGORIES } from "@/lib/categories";
```

Remplacer `CATEGORIES` par `CONSUMER_CATEGORIES`.

- [ ] **Step 5: Remplacer dans toulouse/[category]/page.tsx**

Supprimer la constante `CATEGORIES` locale (lignes 10-18) et ajouter :

```typescript
import { CATEGORY_SEO } from "@/lib/categories";
```

Renommer toutes les occurrences locales de `CATEGORIES` par `CATEGORY_SEO`.

- [ ] **Step 6: Remplacer dans [city]/[category]/page.tsx**

Supprimer la constante `CATEGORIES` locale (lignes 20-27) et ajouter :

```typescript
import { CATEGORY_SEO } from "@/lib/categories";
```

Renommer `CATEGORIES` par `CATEGORY_SEO`. Note : ce fichier utilise `Record<string, string>` (juste label), donc extraire les valeurs : `const catTitle = CATEGORY_SEO[category]?.title;`

- [ ] **Step 7: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`
Expected: Build successful, zero erreurs TypeScript.

- [ ] **Step 8: Commit**

```bash
git add src/lib/categories.ts src/app/\(consumer\)/discover/page.tsx src/app/\(consumer\)/explore/page.tsx src/app/\(consumer\)/search/page.tsx src/app/\(consumer\)/toulouse/\[category\]/page.tsx src/app/\(consumer\)/\[city\]/\[category\]/page.tsx
git commit -m "refactor: extract shared CONSUMER_CATEGORIES to lib/categories.ts"
```

---

## Task 2: Suppression complète des Stories

**Files:**
- Delete: `src/app/(consumer)/components/story-bar.tsx`
- Delete: `src/app/(consumer)/components/story-viewer.tsx`
- Delete: `src/app/api/stories/route.ts`
- Delete: `src/app/api/stories/[id]/route.ts`
- Delete: `src/app/dashboard/stories/page.tsx`
- Modify: `src/app/(consumer)/discover/page.tsx:11` (import StoryBar)
- Modify: `src/app/(consumer)/shop/[id]/shop-profile.tsx:9` (import StoryBar)
- Modify: `src/app/(consumer)/product/[id]/product-detail.tsx` (si import StoryBar)
- Modify: `src/components/dashboard/sidebar.tsx:60-70` (nav item Stories)
- Modify: `src/components/dashboard/bottom-sheet-more.tsx` (si référence stories)
- Modify: `src/components/dashboard/top-header-bar.tsx` (si référence stories)
- Modify: `src/components/dashboard/mobile-top-bar.tsx` (si référence stories)
- Create: `supabase/migrations/039_drop_stories.sql`

- [ ] **Step 1: Supprimer les imports et usages de StoryBar dans discover/page.tsx**

Supprimer la ligne d'import :
```typescript
import { StoryBar } from "../components/story-bar";
```

Supprimer tout JSX qui rend `<StoryBar ... />` dans le fichier.

- [ ] **Step 2: Supprimer StoryBar de shop-profile.tsx**

Supprimer la ligne 9 :
```typescript
import { StoryBar } from "../../components/story-bar";
```

Supprimer tout `<StoryBar ... />` dans le JSX.

- [ ] **Step 3: Vérifier et nettoyer product-detail.tsx**

Vérifier si `StoryBar` ou `StoryViewer` est importé. Si oui, supprimer l'import et l'usage.

- [ ] **Step 4: Retirer Stories de la sidebar dashboard**

Dans `src/components/dashboard/sidebar.tsx`, supprimer l'entrée de navigation Stories (lignes 60-70, le bloc `{ href: "/dashboard/stories", label: "Stories", icon: ... }`).

- [ ] **Step 5: Nettoyer les autres fichiers dashboard**

Vérifier et supprimer toute référence à "stories" dans :
- `src/components/dashboard/bottom-sheet-more.tsx`
- `src/components/dashboard/top-header-bar.tsx`
- `src/components/dashboard/mobile-top-bar.tsx`
- `src/components/dashboard/coach-tips.tsx`

- [ ] **Step 6: Supprimer les fichiers stories**

```bash
rm src/app/\(consumer\)/components/story-bar.tsx
rm src/app/\(consumer\)/components/story-viewer.tsx
rm src/app/api/stories/route.ts
rm -rf src/app/api/stories/\[id\]
rm src/app/dashboard/stories/page.tsx
```

- [ ] **Step 7: Créer la migration DB**

Créer `supabase/migrations/039_drop_stories.sql` :

```sql
-- Drop stories feature (replaced by social links)
DROP TABLE IF EXISTS merchant_stories CASCADE;

-- Drop storage bucket and policies
DELETE FROM storage.objects WHERE bucket_id = 'stories';
DELETE FROM storage.buckets WHERE id = 'stories';
```

- [ ] **Step 8: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`
Expected: Build successful. Aucune référence orpheline à story/stories.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: remove stories feature entirely (frontend + DB migration)"
```

---

## Task 3: Bottom nav — 4 nouveaux onglets

**Files:**
- Modify: `src/app/(consumer)/components/tab-bar.tsx`

- [ ] **Step 1: Mettre à jour les onglets**

Remplacer le tableau `tabs` dans `tab-bar.tsx` :

```typescript
import { Home02, SearchMd, Tag01, User01 } from "@untitledui/icons";

const tabs = [
    { href: "/discover", label: "Accueil", icon: Home02 },
    { href: "/explore", label: "Recherche", icon: SearchMd },
    { href: "/search?filter=promos", label: "Promos", icon: Tag01 },
    { href: "/profile", label: "Profil", icon: User01 },
] as const;
```

- [ ] **Step 2: Mettre à jour la logique isActive pour Promos**

Le tab Promos utilise un query param, donc la logique `startsWith` ne suffit pas. Mettre à jour :

```typescript
const isActive =
    tab.href === "/discover"
        ? pathname === "/discover" || pathname === "/"
        : tab.href.startsWith("/search")
            ? pathname === "/search" && searchParams.get("filter") === "promos"
            : pathname.startsWith(tab.href);
```

Ajouter l'import `useSearchParams` :

```typescript
import { usePathname, useSearchParams } from "next/navigation";
```

Et dans le composant :

```typescript
const searchParams = useSearchParams();
```

- [ ] **Step 3: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(consumer\)/components/tab-bar.tsx
git commit -m "feat: update bottom nav to 4 tabs (Accueil/Recherche/Promos/Profil)"
```

---

## Task 4: Header TikTok avec swipe horizontal

**Files:**
- Create: `src/app/(consumer)/components/feed-header.tsx`
- Modify: `src/app/(consumer)/discover/page.tsx:329-346` (remplacer le toggle actuel)

- [ ] **Step 1: Installer react-swipeable**

```bash
cd twostep-nextjs && npm install react-swipeable
```

- [ ] **Step 2: Créer `feed-header.tsx`**

```typescript
"use client";

import { motion } from "motion/react";
import { cx } from "@/utils/cx";

const TABS = ["Explorer", "Pour toi", "Suivis"] as const;
export type FeedTab = "explorer" | "pour-toi" | "suivis";

const TAB_MAP: Record<(typeof TABS)[number], FeedTab> = {
    Explorer: "explorer",
    "Pour toi": "pour-toi",
    Suivis: "suivis",
};

interface FeedHeaderProps {
    activeTab: FeedTab;
    onTabChange: (tab: FeedTab) => void;
}

export function FeedHeader({ activeTab, onTabChange }: FeedHeaderProps) {
    return (
        <div
            className="flex border-b border-[var(--ts-border)]"
            role="tablist"
            aria-label="Feed"
        >
            {TABS.map((label) => {
                const value = TAB_MAP[label];
                const isActive = activeTab === value;
                return (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onTabChange(value)}
                        className={cx(
                            "relative flex-1 py-2.5 text-center text-[13px] font-semibold transition duration-100 ease-linear",
                            isActive
                                ? "text-[var(--ts-text)]"
                                : "text-[var(--ts-text-secondary)]",
                        )}
                    >
                        {label}
                        {isActive && (
                            <motion.div
                                layoutId="feed-tab-indicator"
                                className="absolute bottom-0 left-1/2 h-[2.5px] w-8 -translate-x-1/2 rounded-full bg-[var(--ts-accent)]"
                                transition={{ type: "spring", stiffness: 200, damping: 30 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 3: Intégrer le swipe dans discover/page.tsx**

Ajouter les imports en haut :

```typescript
import { useSwipeable } from "react-swipeable";
import { FeedHeader, type FeedTab } from "../components/feed-header";
```

Ajouter le handler swipe dans `DiscoverContent`, après la définition de `setFeedTab` :

```typescript
const tabOrder: FeedTab[] = ["explorer", "pour-toi", "suivis"];
const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
        const idx = tabOrder.indexOf(feedTab);
        if (idx < tabOrder.length - 1) setFeedTab(tabOrder[idx + 1]);
    },
    onSwipedRight: () => {
        const idx = tabOrder.indexOf(feedTab);
        if (idx > 0) setFeedTab(tabOrder[idx - 1]);
    },
    trackMouse: false,
    delta: 50,
    preventScrollOnSwipe: false,
});
```

- [ ] **Step 4: Remplacer le header existant**

Remplacer le bloc actuel (lignes 329-346, le `<div className="flex border-b ...">` avec les 3 boutons) par :

```tsx
<FeedHeader activeTab={feedTab} onTabChange={setFeedTab} />
```

Supprimer l'ancien header logo/notification du bloc (lignes 188-205, le `<div className="flex items-center justify-between">` avec le logo TWO-STEP et la cloche).

- [ ] **Step 5: Wrapper le contenu du feed avec swipeHandlers**

Entourer le contenu du feed (le bloc `{feedTab === "explorer" ? ... : feedTab === "pour-toi" ? ... : ...}`) avec :

```tsx
<div {...swipeHandlers}>
    {feedTab === "explorer" ? (
        // ... existing explorer content
    ) : feedTab === "pour-toi" ? (
        // ... existing pour-toi content
    ) : (
        // ... existing suivis content
    )}
</div>
```

- [ ] **Step 6: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/app/\(consumer\)/components/feed-header.tsx src/app/\(consumer\)/discover/page.tsx package.json package-lock.json
git commit -m "feat: TikTok-style header with swipe between Explorer/Pour toi/Suivis"
```

---

## Task 5: Liens sociaux — Fiche boutique consumer

**Files:**
- Create: `supabase/migrations/040_merchant_social_links.sql`
- Modify: `src/app/(consumer)/shop/[id]/shop-profile.tsx:228-240` (zone boutons S'abonner/Partager)

- [ ] **Step 1: Migration DB — colonnes sociales**

Créer `supabase/migrations/040_merchant_social_links.sql` :

```sql
-- Add dedicated social link columns (replaces JSONB links for social)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Update the merchant_profile RPC to include new columns
CREATE OR REPLACE FUNCTION get_merchant_profile(p_merchant_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    merchant_id UUID,
    merchant_name TEXT,
    merchant_description TEXT,
    merchant_photo TEXT,
    merchant_logo TEXT,
    merchant_cover TEXT,
    merchant_address TEXT,
    merchant_city TEXT,
    merchant_links JSONB,
    merchant_opening_hours JSONB,
    merchant_instagram TEXT,
    merchant_tiktok TEXT,
    merchant_website TEXT,
    product_count BIGINT,
    follower_count BIGINT,
    is_following BOOLEAN
) AS $$
SELECT
    m.id AS merchant_id,
    m.name AS merchant_name,
    m.description AS merchant_description,
    m.photo_url AS merchant_photo,
    m.logo_url AS merchant_logo,
    m.cover_photo_url AS merchant_cover,
    m.address AS merchant_address,
    m.city AS merchant_city,
    m.links AS merchant_links,
    m.opening_hours AS merchant_opening_hours,
    m.instagram_url AS merchant_instagram,
    m.tiktok_url AS merchant_tiktok,
    m.website_url AS merchant_website,
    (SELECT COUNT(*) FROM products p JOIN stock s ON s.product_id = p.id WHERE p.merchant_id = m.id AND s.quantity > 0) AS product_count,
    (SELECT COUNT(*) FROM user_follows uf WHERE uf.merchant_id = m.id) AS follower_count,
    CASE WHEN p_user_id IS NOT NULL THEN EXISTS(SELECT 1 FROM user_follows uf WHERE uf.merchant_id = m.id AND uf.user_id = p_user_id) ELSE false END AS is_following
FROM merchants m
WHERE m.id = p_merchant_id;
$$ LANGUAGE sql STABLE;
```

- [ ] **Step 2: Mettre à jour l'interface MerchantProfile**

Dans `shop-profile.tsx`, ajouter les champs au type :

```typescript
interface MerchantProfile {
    // ... existing fields ...
    merchant_instagram: string | null;
    merchant_tiktok: string | null;
    merchant_website: string | null;
}
```

- [ ] **Step 3: Ajouter les icônes sociales**

Importer les icônes sociales existantes dans le projet :

```typescript
import { Instagram } from "@/components/foundations/social-icons/instagram";
import { Tiktok } from "@/components/foundations/social-icons/tiktok";
import { Globe02 } from "@untitledui/icons";
```

Remplacer la zone boutons S'abonner/Partager (lignes ~228-260) par :

```tsx
{/* S'abonner + Social links + Partager — Instagram style */}
<div className="mt-3 flex items-center gap-2">
    {/* S'abonner — flex-1 */}
    <button
        type="button"
        onClick={() => merchantUuid && (isFollowing ? unfollow.mutate(merchantUuid) : follow.mutate(merchantUuid))}
        className={cx(
            "flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition duration-100 ease-linear active:scale-[0.97]",
            isFollowing
                ? "border border-[var(--ts-border)] bg-[var(--ts-bg-input)] text-[var(--ts-text-secondary)]"
                : "bg-[var(--ts-accent)] text-white",
        )}
    >
        {isFollowing ? "Abonné" : "S'abonner"}
    </button>

    {/* Social icons — only shown if URL exists */}
    {profile.merchant_instagram && (
        <a
            href={profile.merchant_instagram.startsWith("http") ? profile.merchant_instagram : `https://instagram.com/${profile.merchant_instagram.replace("@", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-10 items-center justify-center rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg-input)] transition duration-100 active:bg-[var(--ts-border)]"
            aria-label="Instagram"
        >
            <Instagram className="size-[18px] text-[var(--ts-text-secondary)]" />
        </a>
    )}
    {profile.merchant_tiktok && (
        <a
            href={profile.merchant_tiktok.startsWith("http") ? profile.merchant_tiktok : `https://tiktok.com/@${profile.merchant_tiktok.replace("@", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-10 items-center justify-center rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg-input)] transition duration-100 active:bg-[var(--ts-border)]"
            aria-label="TikTok"
        >
            <Tiktok className="size-[18px] text-[var(--ts-text-secondary)]" />
        </a>
    )}
    {profile.merchant_website && (
        <a
            href={profile.merchant_website.startsWith("http") ? profile.merchant_website : `https://${profile.merchant_website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-10 items-center justify-center rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg-input)] transition duration-100 active:bg-[var(--ts-border)]"
            aria-label="Site web"
        >
            <Globe02 className="size-[18px] text-[var(--ts-text-secondary)]" />
        </a>
    )}

    {/* Partager */}
    <button
        type="button"
        onClick={() => {
            if (navigator.share) {
                navigator.share({ title: profile.merchant_name, url: window.location.href });
            } else {
                navigator.clipboard.writeText(window.location.href);
            }
        }}
        className="flex size-10 items-center justify-center rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg-input)] transition duration-100 active:bg-[var(--ts-border)]"
        aria-label="Partager"
    >
        <Share07 className="size-[18px] text-[var(--ts-text-secondary)]" />
    </button>
</div>
```

- [ ] **Step 4: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/040_merchant_social_links.sql src/app/\(consumer\)/shop/\[id\]/shop-profile.tsx
git commit -m "feat: add social links (Instagram/TikTok/website) to shop profile"
```

---

## Task 6: Dashboard — Liens sociaux dans les paramètres

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Ajouter les champs sociaux dans SettingsPageInner**

Après les champs existants (email, password), ajouter un state pour les liens sociaux :

```typescript
const [instagramUrl, setInstagramUrl] = useState(merchant?.instagram_url ?? "");
const [tiktokUrl, setTiktokUrl] = useState(merchant?.tiktok_url ?? "");
const [websiteUrl, setWebsiteUrl] = useState(merchant?.website_url ?? "");
const [savingSocial, setSavingSocial] = useState(false);
```

Ajouter un useEffect pour initialiser quand merchant charge :

```typescript
useEffect(() => {
    if (merchant) {
        setInstagramUrl(merchant.instagram_url ?? "");
        setTiktokUrl(merchant.tiktok_url ?? "");
        setWebsiteUrl(merchant.website_url ?? "");
    }
}, [merchant]);
```

- [ ] **Step 2: Ajouter le handler de sauvegarde**

```typescript
const handleSaveSocial = async (e: FormEvent) => {
    e.preventDefault();
    if (!merchant) return;
    setSavingSocial(true);
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("merchants")
            .update({
                instagram_url: instagramUrl || null,
                tiktok_url: tiktokUrl || null,
                website_url: websiteUrl || null,
            })
            .eq("id", merchant.id);
        if (error) throw error;
        toast("Liens sociaux mis à jour");
        refetch();
    } catch {
        toast("Erreur lors de la mise à jour", "error");
    } finally {
        setSavingSocial(false);
    }
};
```

- [ ] **Step 3: Ajouter la section UI**

Ajouter ce bloc dans le JSX, après la section "Connexion caisse" et avant "Mot de passe" :

```tsx
{/* ── Réseaux sociaux & Site web ── */}
<section className="rounded-xl border border-[var(--ts-border)] bg-white p-5">
    <h2 className="font-heading text-base font-semibold text-[var(--ts-text)]">
        Réseaux sociaux & Site web
    </h2>
    <p className="mt-1 text-xs text-[var(--ts-text-secondary)]">
        Les clients verront ces liens sur votre page boutique. Ajoutez au moins votre Instagram.
    </p>
    <form onSubmit={handleSaveSocial} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--ts-text-secondary)]">Instagram</span>
            <input
                type="text"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="@votre_boutique ou URL complète"
                className="rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg)] px-3 py-2 text-sm text-[var(--ts-text)] placeholder:text-[var(--ts-text-secondary)]/40"
            />
        </label>
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--ts-text-secondary)]">TikTok</span>
            <input
                type="text"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                placeholder="@votre_boutique ou URL complète"
                className="rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg)] px-3 py-2 text-sm text-[var(--ts-text)] placeholder:text-[var(--ts-text-secondary)]/40"
            />
        </label>
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--ts-text-secondary)]">Site web</span>
            <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://www.votre-boutique.fr"
                className="rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg)] px-3 py-2 text-sm text-[var(--ts-text)] placeholder:text-[var(--ts-text-secondary)]/40"
            />
        </label>
        <button
            type="submit"
            disabled={savingSocial}
            className="self-start rounded-lg bg-[var(--ts-accent)] px-4 py-2 text-sm font-semibold text-white transition duration-100 hover:opacity-90 disabled:opacity-50"
        >
            {savingSocial ? "Enregistrement..." : "Enregistrer"}
        </button>
    </form>
</section>
```

- [ ] **Step 4: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings/page.tsx
git commit -m "feat: add social links section to dashboard settings"
```

---

## Task 7: Dashboard — Fusionner Produits + Stock

**Files:**
- Modify: `src/app/dashboard/products/page.tsx` (ajouter contrôles stock inline)
- Modify: `src/components/dashboard/sidebar.tsx:28-38` (retirer Stock de la nav)
- Delete: `src/app/dashboard/stock/page.tsx`
- Delete: `src/app/dashboard/stock/loading.tsx`

- [ ] **Step 1: Retirer Stock de la sidebar**

Dans `sidebar.tsx`, supprimer le bloc nav item Stock (lignes 28-38, celui avec `href: "/dashboard/stock"`).

- [ ] **Step 2: Ajouter les métriques stock en haut de products/page.tsx**

Lire le fichier `src/app/dashboard/products/page.tsx` complet et ajouter en haut du JSX, sous le `<PageHeader>`, les 4 métriques de stock (reprises de stock/page.tsx) :

```tsx
{/* Stock metrics */}
<div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
    <MetricCard label="Total" value={totalProducts} />
    <MetricCard label="En stock" value={inStock} color="success" />
    <MetricCard label="Stock bas" value={lowStock} color="warning" />
    <MetricCard label="Rupture" value={outOfStock} color="error" />
</div>
```

Calculer les valeurs (comme dans stock/page.tsx) :

```typescript
const totalProducts = products.length;
const inStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) > 0).length;
const lowStock = products.filter((p) => {
    const q = p.stock?.[0]?.quantity ?? 0;
    return q > 0 && q <= 5;
}).length;
const outOfStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) === 0).length;
```

- [ ] **Step 3: Ajouter les contrôles stock inline sur chaque ligne produit**

Sur chaque card/ligne produit dans le tableau, ajouter les boutons −/+ et le champ de saisie directe :

```tsx
{/* Stock controls inline */}
<div className="flex items-center gap-1.5">
    <button
        type="button"
        onClick={() => handleDelta(product.id, -1)}
        disabled={updatingId === product.id || (product.stock?.[0]?.quantity ?? 0) <= 0}
        className="flex size-7 items-center justify-center rounded-md border border-[var(--ts-border)] text-sm transition duration-100 hover:bg-[var(--ts-bg-input)] disabled:opacity-30"
    >
        −
    </button>
    <input
        type="number"
        min="0"
        value={product.stock?.[0]?.quantity ?? 0}
        onChange={(e) => handleAbsolute(product.id, e.target.value)}
        className="w-12 rounded-md border border-[var(--ts-border)] bg-[var(--ts-bg)] px-1 py-1 text-center text-sm text-[var(--ts-text)]"
    />
    <button
        type="button"
        onClick={() => handleDelta(product.id, 1)}
        disabled={updatingId === product.id}
        className="flex size-7 items-center justify-center rounded-md border border-[var(--ts-border)] text-sm transition duration-100 hover:bg-[var(--ts-bg-input)] disabled:opacity-30"
    >
        +
    </button>
    <StockBadge quantity={product.stock?.[0]?.quantity ?? 0} />
</div>
```

Ajouter les imports et les handlers `handleDelta`/`handleAbsolute` (copiés de stock/page.tsx).

- [ ] **Step 4: Supprimer les pages stock**

```bash
rm src/app/dashboard/stock/page.tsx
rm src/app/dashboard/stock/loading.tsx
rmdir src/app/dashboard/stock
```

- [ ] **Step 5: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: merge Products + Stock into single dashboard page"
```

---

## Task 8: Dashboard — Réordonner l'onboarding (5 étapes + bonus)

**Files:**
- Modify: `src/app/dashboard/page.tsx:55-100` (bloc setSteps)

- [ ] **Step 1: Réordonner les étapes**

Dans `src/app/dashboard/page.tsx`, remplacer le bloc `setSteps([...])` (lignes 55-100) par le nouvel ordre :

```typescript
setSteps([
    {
        label: "Compléter votre profil boutique",
        description: "Bio, adresse et horaires d'ouverture — les infos qui donnent envie de vous rendre visite.",
        href: "/dashboard/store",
        cta: "Compléter mon profil",
        checked: hasProfile,
    },
    {
        label: "Ajouter une photo de boutique",
        description: "Votre vitrine ou votre intérieur — c'est la première chose que les clients voient.",
        href: "/dashboard/store",
        cta: "Ajouter ma photo",
        checked: hasPhoto,
    },
    {
        label: "Ajouter votre téléphone de contact",
        description: "Pour que vos clients puissent vous joindre facilement.",
        href: "/dashboard/store",
        cta: "Ajouter mon téléphone",
        checked: hasEmail,
    },
    {
        label: "Connecter votre caisse (POS)",
        description: "Square, Lightspeed ou Shopify — votre stock et vos produits se synchronisent automatiquement.",
        href: "/dashboard/settings",
        cta: "Connecter ma caisse",
        checked: hasPOS,
    },
    {
        label: "Vérifier vos produits",
        description: "Vérifiez les photos, noms et stock de vos produits importés.",
        href: "/dashboard/products",
        cta: "Voir mes produits",
        checked: hasProductPhotos,
    },
]);
```

- [ ] **Step 2: Ajouter le bonus Google Merchant**

Après le `setSteps(...)`, ajouter la vérification du bonus :

```typescript
// Bonus step — only appears when all 5 main steps are complete
const allDone = hasProfile && hasPhoto && hasEmail && hasPOS && hasProductPhotos;
if (allDone) {
    const { data: googleConn } = await supabase
        .from("google_merchant_connections")
        .select("id")
        .eq("merchant_id", merchant!.id)
        .maybeSingle();

    setSteps((prev) => [
        ...prev,
        {
            label: "🎁 Bonus : Connecter Google Merchant Center",
            description: "Vos produits apparaissent directement sur Google Shopping — visibilité maximale.",
            href: "/dashboard/google",
            cta: "Connecter Google",
            checked: !!googleConn,
        },
    ]);
}
```

- [ ] **Step 3: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: reorder onboarding steps (profile→photo→phone→POS→products + Google bonus)"
```

---

## Task 9: Page "Voir tout" — Nettoyage

**Files:**
- Modify: `src/app/(consumer)/search/page.tsx`

- [ ] **Step 1: Supprimer le logo et le titre doré**

Dans `search/page.tsx`, chercher et supprimer :
- Tout logo TWO-STEP en haut de page (probablement un `<img src="/logo-icon.webp" ... />` ou un `<h1>`)
- Le titre "Promotions" en doré s'il existe (lignes avec `text-[#...] font-...` contenant "Promotions")

Garder uniquement : la barre de recherche et les filtres catégorie.

- [ ] **Step 2: Utiliser les catégories partagées**

Déjà fait en Task 1 — vérifier que `CONSUMER_CATEGORIES` est bien importé et utilisé.

- [ ] **Step 3: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(consumer\)/search/page.tsx
git commit -m "fix: clean up search page — remove logo and promo title"
```

---

## Task 10: Skeletons propres — Inspirés Instagram/Vinted

**Files:**
- Create: `src/app/(consumer)/components/feed-skeleton.tsx`
- Modify: `src/app/(consumer)/discover/page.tsx` (remplacer les `animate-pulse` basiques)

- [ ] **Step 1: Créer le composant skeleton**

```typescript
"use client";

import { cx } from "@/utils/cx";

function Bone({ className, delay = 0 }: { className?: string; delay?: number }) {
    return (
        <div
            className={cx("animate-pulse rounded-md bg-[var(--ts-bg-input)]", className)}
            style={{ animationDelay: `${delay}ms` }}
        />
    );
}

/** Skeleton for a product card in a 2-col grid (Vinted-style) */
export function ProductCardSkeleton({ index = 0 }: { index?: number }) {
    const d = index * 200; // stagger 200ms per card (Instagram pattern)
    return (
        <div className="overflow-hidden rounded-[10px] border-[0.5px] border-[var(--ts-border)] bg-[var(--ts-bg-input)]">
            <Bone className="h-[220px] w-full rounded-none" delay={d} />
            <div className="px-2 py-2">
                <Bone className="h-3 w-[70%]" delay={d + 50} />
                <Bone className="mt-1.5 h-2.5 w-12" delay={d + 100} />
                <Bone className="mt-1.5 h-2 w-[55%]" delay={d + 150} />
            </div>
        </div>
    );
}

/** Skeleton for a promo row card */
export function PromoCardSkeleton({ index = 0 }: { index?: number }) {
    const d = index * 200;
    return (
        <div className="flex items-center rounded-[10px] bg-[var(--ts-bg-input)] p-2.5" style={{ gap: 10 }}>
            <Bone className="size-16 shrink-0 rounded-lg" delay={d} />
            <div className="flex-1">
                <Bone className="h-3 w-24" delay={d + 50} />
                <Bone className="mt-1.5 h-3 w-[80%]" delay={d + 100} />
                <Bone className="mt-1.5 h-2.5 w-10" delay={d + 150} />
            </div>
        </div>
    );
}

/** Skeleton for the section header */
export function SectionHeaderSkeleton() {
    return (
        <div className="flex items-center gap-2.5 px-4">
            <Bone className="size-8 rounded-xl" />
            <div>
                <Bone className="h-3.5 w-32" delay={50} />
                <Bone className="mt-1 h-2.5 w-44" delay={100} />
            </div>
        </div>
    );
}

/** Full explorer tab skeleton */
export function ExplorerSkeleton() {
    return (
        <div className="flex flex-col gap-5 pb-24 pt-4">
            {/* Promos section */}
            <section>
                <SectionHeaderSkeleton />
                <div className="mt-3 px-3.5">
                    <PromoCardSkeleton index={0} />
                </div>
            </section>

            {/* Trending section */}
            <section>
                <SectionHeaderSkeleton />
                <div className="mt-3 grid grid-cols-2 gap-2 px-4">
                    {[0, 1, 2, 3].map((i) => (
                        <ProductCardSkeleton key={i} index={i} />
                    ))}
                </div>
            </section>
        </div>
    );
}
```

- [ ] **Step 2: Utiliser dans discover/page.tsx**

Remplacer les blocs `animate-pulse` existants (ex: `<div className="h-[84px] animate-pulse rounded-[10px]...">`) par les composants skeleton correspondants :

```typescript
import { ProductCardSkeleton, PromoCardSkeleton } from "../components/feed-skeleton";
```

Puis dans les sections loading :

```tsx
{loadingPromos ? (
    <PromoCardSkeleton index={0} />
) : (/* ... existing content ... */)}
```

```tsx
{loadingTrending ? (
    <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
            <ProductCardSkeleton key={i} index={i} />
        ))}
    </div>
) : (/* ... existing content ... */)}
```

- [ ] **Step 3: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(consumer\)/components/feed-skeleton.tsx src/app/\(consumer\)/discover/page.tsx
git commit -m "feat: add proper staggered skeletons (Instagram/Vinted-inspired)"
```

---

## Task 11: Build final + nettoyage

**Files:**
- Verify all modified files

- [ ] **Step 1: Build complet**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -30
```

Expected: Build successful, zéro erreurs.

- [ ] **Step 2: Grep orphelines**

Vérifier qu'aucune référence orpheline ne reste :

```bash
cd twostep-nextjs && grep -r "story" src/ --include="*.tsx" --include="*.ts" -l | grep -v node_modules | grep -v ".next"
cd twostep-nextjs && grep -r "StoryBar\|StoryViewer\|story-bar\|story-viewer" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: Zéro résultats (ou uniquement des faux positifs comme "history").

- [ ] **Step 3: Vérifier les imports categories**

```bash
cd twostep-nextjs && grep -r "const CATEGORIES" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: Zéro résultats (toutes les copies locales ont été remplacées par l'import centralisé). Exception possible : `tips-history/page.tsx` et `product-form.tsx` qui ont des CATEGORIES différentes (dashboard, pas consumer).

- [ ] **Step 4: Commit final si nettoyage nécessaire**

```bash
git add -A
git commit -m "chore: final cleanup — verify zero orphan references"
```

---

## Résumé des commits

| # | Message | Scope |
|---|---------|-------|
| 1 | `refactor: extract shared CONSUMER_CATEGORIES to lib/categories.ts` | 6 fichiers |
| 2 | `feat: remove stories feature entirely (frontend + DB migration)` | 12 fichiers supprimés/modifiés |
| 3 | `feat: update bottom nav to 4 tabs (Accueil/Recherche/Promos/Profil)` | 1 fichier |
| 4 | `feat: TikTok-style header with swipe between Explorer/Pour toi/Suivis` | 2 fichiers + dep |
| 5 | `feat: add social links (Instagram/TikTok/website) to shop profile` | 2 fichiers + migration |
| 6 | `feat: add social links section to dashboard settings` | 1 fichier |
| 7 | `feat: merge Products + Stock into single dashboard page` | 4 fichiers |
| 8 | `feat: reorder onboarding steps + Google Merchant bonus` | 1 fichier |
| 9 | `fix: clean up search page — remove logo and promo title` | 1 fichier |
| 10 | `feat: add proper staggered skeletons (Instagram/Vinted-inspired)` | 2 fichiers |
| 11 | `chore: final cleanup` | vérification |
