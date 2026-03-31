# Refonte Charte Minuit Électrique — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les polices et couleurs de Two-Step (thème chaud/crème → thème clair élégant bleu électrique)

**Architecture:** Changer d'abord les fichiers CSS centraux et le layout (polices + couleurs de base), puis passer zone par zone pour remplacer les couleurs hardcodées dans chaque composant. Un commit par zone.

**Tech Stack:** Next.js, Tailwind CSS v4, Google Fonts (Cormorant Garamond + Syne)

---

## Table de correspondance couleurs

| Ancienne | Nouvelle | Usage |
|----------|----------|-------|
| `#F5EDD6`, `#F4F1DE` (crème) | `#FFFFFF` | Fond principal |
| `#EDE0C4`, `#ebe7d0` (crème dark) | `#F8F9FC` | Fond secondaire |
| `#faf9f5` (crème hover) | `#F5F6FA` | Hover, inputs |
| `#C8813A`, `#c87830` (ochre) | `#4268FF` | Accent principal |
| `#A86828` (ochre dark) | `#3558E0` | Accent hover |
| `#E07A5F` (terracotta) | `#4268FF` | Accent dashboard |
| `#c96a50` (terracotta hover) | `#3558E0` | Accent hover dashboard |
| `#2C2018`, `#130e07` (brown) | `#1A1F36` | Texte primaire |
| `#1e1610` (brown hover) | `#0F1225` | Texte primaire hover |
| `#6B4F38` (brown mid) | `#8E96B0` | Texte secondaire |
| `#f0dfc0` (text light) | `#C8D6F0` | Texte primaire (sur fond dark) |
| `#a07840` (text muted) | `#566080` | Texte muted (sur fond dark) |
| `#81B29A` (sage) | `#22B86E` | Success/vert (garder un vert) |
| `#e8f3ee` (sage light) | `#E8F8EF` | Success light |
| `rgba(44,32,24,...)` | `rgba(26,31,54,...)` | Brown rgba → navy rgba |
| `rgba(200,129,58,...)` | `rgba(66,104,255,...)` | Ochre rgba → bleu rgba |

## Table de correspondance polices

| Ancienne | Nouvelle |
|----------|----------|
| `Plus_Jakarta_Sans` / `--font-plus-jakarta-sans` | `Syne` / `--font-syne` |
| `Fraunces` / `--font-fraunces` | `Cormorant_Garamond` / `--font-cormorant` |
| `font-body` → Plus Jakarta Sans | `font-body` → Syne |
| `font-display` → Fraunces | `font-display` → Cormorant Garamond |

---

### Task 1: Fichiers CSS centraux + layout (polices + couleurs de base)

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/styles/dashboard.css`
- Modify: `src/styles/theme.css` (ligne 3-5 seulement, font-family)

- [ ] **Step 1: Modifier `src/app/layout.tsx`**

Remplacer les imports de polices et les références :

```tsx
import { Cormorant_Garamond, Syne } from "next/font/google";

const syne = Syne({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-syne",
});

const cormorantGaramond = Cormorant_Garamond({
    subsets: ["latin"],
    display: "swap",
    weight: ["300", "400"],
    style: ["normal", "italic"],
    variable: "--font-cormorant",
});
```

Dans `viewport`, changer `themeColor: "#2C1A0E"` → `"#FFFFFF"` et `colorScheme: "dark light"` → `"light"`.

Dans `<body>`, changer :
- `className`: `cx(syne.variable, cormorantGaramond.variable, "antialiased")`
- `style.fontFamily`: `"var(--font-syne), system-ui, sans-serif"`
- `style.background`: `"#FFFFFF"`

- [ ] **Step 2: Modifier `src/styles/theme.css` (lignes 2-5)**

Remplacer les font-family :
```css
--font-body: var(--font-syne, "Syne"), system-ui, sans-serif;
--font-display: var(--font-cormorant, "Cormorant Garamond"), Georgia, serif;
```

- [ ] **Step 3: Modifier `src/styles/globals.css`**

Remplacer le bloc `:root` (lignes 33-58) :
```css
:root {
    --ts-white:      #FFFFFF;
    --ts-bg:         #F8F9FC;
    --ts-bg-input:   #F5F6FA;
    --ts-border:     #E2E5F0;
    --ts-border-light: #ECEEF4;
    --ts-accent:     #4268FF;
    --ts-accent-hover: #3558E0;
    --ts-accent-light: #93AEFF;
    --ts-accent-bg:  rgba(66, 104, 255, 0.06);
    --ts-text:       #1A1F36;
    --ts-text-secondary: #8E96B0;
    --ts-text-muted: #A8AEBF;
    --ts-success:    #22B86E;
    --ts-red:        #D94F4F;
    --ts-orange:     #E8923A;

    /* Dark (pour CTA marketing, sidebar dashboard) */
    --ts-dark:       #070A10;
    --ts-dark-surface: #0E1420;
    --ts-dark-text:  #C8D6F0;
    --ts-dark-muted: #566080;

    /* Override UntitledUI brand palette → bleu électrique */
    --color-brand-25:  #f5f7ff;
    --color-brand-50:  #eef1ff;
    --color-brand-100: #dce2ff;
    --color-brand-200: #b8c4ff;
    --color-brand-300: #93aeff;
    --color-brand-400: #6b8aff;
    --color-brand-500: #4268ff;
    --color-brand-600: #3558e0;
    --color-brand-700: #2847b8;
    --color-brand-800: #1e3690;
    --color-brand-900: #142668;
    --color-brand-950: #0a1540;
}
```

- [ ] **Step 4: Modifier `src/styles/dashboard.css`**

Remplacer le bloc `:root` (lignes 4-18) :
```css
:root {
    --ts-terracotta: #4268FF;
    --ts-terracotta-hover: #3558E0;
    --ts-sage: #22B86E;
    --ts-sage-light: #E8F8EF;
    --ts-cream: #F8F9FC;
    --ts-cream-dark: #F5F6FA;
    --ts-dark: #1A1F36;
    --ts-dark-hover: #0F1225;
    --ts-dark-light: rgba(26, 31, 54, 0.08);
    --ts-sidebar-bg: #0E1420;
    --ts-accent: #4268FF;
    --ts-accent-hover: #3558E0;
    --ts-bg-warm: #F8F9FC;
    --ts-bg-card: #FFFFFF;
}
```

Ligne 143, remplacer `background: #faf9f5` → `background: #F5F6FA`.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/styles/globals.css src/styles/dashboard.css src/styles/theme.css
git commit -m "feat: charte Minuit Électrique — polices Syne+Cormorant, palette bleu électrique"
```

---

### Task 2: Site marketing (hero, nav, sections, footer)

**Files:**
- Modify: `src/app/(marketing)/sections/hero.tsx`
- Modify: `src/app/(marketing)/sections/nav.tsx`
- Modify: `src/app/(marketing)/sections/footer.tsx`
- Modify: `src/app/(marketing)/sections/pioneers.tsx`
- Modify: `src/app/(marketing)/sections/how.tsx`
- Modify: `src/app/(marketing)/sections/about.tsx`
- Modify: `src/app/(marketing)/sections/statement.tsx`
- Modify: `src/app/(marketing)/sections/marquee.tsx`
- Modify: `src/app/(marketing)/sections/contact.tsx`
- Modify: `src/app/(marketing)/components/glow-input.tsx`
- Modify: `src/app/(marketing)/components/background-paths.tsx`
- Modify: `src/app/(marketing)/home-screen-v1.tsx`

- [ ] **Step 1: Dans chaque fichier, appliquer la table de correspondance**

Remplacements systématiques dans tous les fichiers marketing :
- `#F5EDD6` → `#FFFFFF`
- `#EDE0C4` → `#F8F9FC`
- `#C8813A` → `#4268FF`
- `#A86828` → `#3558E0`
- `#2C2018` → `#1A1F36`
- `#1e1610` → `#0F1225`
- `#6B4F38` → `#8E96B0`
- `#130e07` → `#FFFFFF`
- `#f0dfc0` → `#1A1F36` (texte primaire sur fond clair maintenant)
- `#a07840` → `#8E96B0`
- `rgba(44, 32, 24` → `rgba(26, 31, 54`
- `rgba(44,32,24` → `rgba(26,31,54`
- `rgba(200, 129, 58` → `rgba(66, 104, 255`
- `rgba(200,129,58` → `rgba(66,104,255`

Pour la section CTA (contact.tsx) : garder/mettre le fond en `#070A10` avec texte `#C8D6F0`.

- [ ] **Step 2: Vérifier visuellement**

Run: `npm run dev` et ouvrir http://localhost:3000

- [ ] **Step 3: Commit**

```bash
git add src/app/\(marketing\)/
git commit -m "feat: charte Minuit Électrique — site marketing blanc + CTA sombre"
```

---

### Task 3: App consumer (composants partagés)

**Files:**
- Modify: `src/app/(consumer)/components/welcome-gate.tsx`
- Modify: `src/app/(consumer)/components/suggestion-drawer.tsx`
- Modify: `src/app/(consumer)/components/tab-bar.tsx`
- Modify: `src/app/(consumer)/components/product-card.tsx`
- Modify: `src/app/(consumer)/components/side-panel.tsx`
- Modify: `src/app/(consumer)/components/shop-card.tsx`
- Modify: `src/app/(consumer)/components/bottom-sheet.tsx`
- Modify: `src/app/(consumer)/components/map-view.tsx`
- Modify: `src/app/(consumer)/components/search-bar.tsx`
- Modify: `src/app/(consumer)/components/filter-pills.tsx`
- Modify: `src/app/(consumer)/components/toast.tsx`
- Modify: `src/app/(consumer)/components/stock-badge.tsx`
- Modify: `src/app/(consumer)/lib/mapbox.ts`
- Modify: `src/app/(consumer)/loading.tsx`
- Modify: `src/app/(consumer)/error.tsx`
- Modify: `src/app/(consumer)/not-found.tsx`

- [ ] **Step 1: Appliquer la table de correspondance dans chaque fichier**

Mêmes remplacements que Task 2.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(consumer\)/components/ src/app/\(consumer\)/loading.tsx src/app/\(consumer\)/error.tsx src/app/\(consumer\)/not-found.tsx src/app/\(consumer\)/lib/
git commit -m "feat: charte Minuit Électrique — composants consumer"
```

---

### Task 4: App consumer (pages)

**Files:**
- Modify: `src/app/(consumer)/discover/page.tsx`
- Modify: `src/app/(consumer)/explore/page.tsx`
- Modify: `src/app/(consumer)/favorites/page.tsx`
- Modify: `src/app/(consumer)/profile/page.tsx`
- Modify: `src/app/(consumer)/profile/notifications/page.tsx`
- Modify: `src/app/(consumer)/product/[id]/product-detail.tsx`
- Modify: `src/app/(consumer)/shop/[id]/shop-profile.tsx`
- Modify: `src/app/(consumer)/search/page.tsx` (si couleurs hardcodées)
- Modify: `src/app/(consumer)/toulouse/[category]/page.tsx` (si couleurs hardcodées)

- [ ] **Step 1: Appliquer la table de correspondance dans chaque fichier**

- [ ] **Step 2: Commit**

```bash
git add src/app/\(consumer\)/
git commit -m "feat: charte Minuit Électrique — pages consumer"
```

---

### Task 5: Auth (login, signup, forgot, reset)

**Files:**
- Modify: `src/app/auth/signup/page.tsx`
- Modify: `src/app/auth/login/page.tsx`
- Modify: `src/app/auth/forgot-password/page.tsx`
- Modify: `src/app/auth/reset-password/page.tsx`

- [ ] **Step 1: Appliquer la table de correspondance**

- [ ] **Step 2: Commit**

```bash
git add src/app/auth/
git commit -m "feat: charte Minuit Électrique — pages auth"
```

---

### Task 6: Dashboard (layout + composants + pages)

**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`
- Modify: `src/app/dashboard/store/page.tsx`
- Modify: `src/app/dashboard/promotions/page.tsx`
- Modify: `src/app/dashboard/tips-history/page.tsx`
- Modify: `src/app/dashboard/stock/page.tsx`
- Modify: `src/app/dashboard/products/new/page.tsx`
- Modify: `src/components/dashboard/onboarding-checklist.tsx`
- Modify: `src/components/dashboard/coach-tips.tsx`
- Modify: `src/components/dashboard/today-tasks.tsx`
- Modify: `src/components/dashboard/twostep-score.tsx`
- Modify: `src/components/dashboard/achievement-toast.tsx`
- Modify: `src/components/dashboard/achievement-modal.tsx`
- Modify: `src/components/dashboard/product-form.tsx`
- Modify: `src/components/dashboard/top-header-bar.tsx`
- Modify: `src/components/dashboard/tab-nav.tsx`
- Modify: `src/components/dashboard/stock-badge.tsx`
- Modify: `src/components/dashboard/page-header.tsx`
- Modify: `src/components/dashboard/metric-card.tsx`
- Modify: `src/components/dashboard/empty-state.tsx`
- Modify: `src/components/dashboard/discovery-funnel.tsx`
- Modify: `src/components/dashboard/hero-stat.tsx`
- Modify: `src/lib/achievements.ts`

- [ ] **Step 1: Appliquer la table de correspondance**

Rappel : le dashboard est clair (`#F8F9FC` fond, `#FFFFFF` cards) sauf la sidebar qui est dark (`#0E1420`).

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/ src/components/dashboard/ src/lib/achievements.ts
git commit -m "feat: charte Minuit Électrique — dashboard clair + sidebar dark"
```

---

### Task 7: Onboarding + utilitaires

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/onboarding/test/page.tsx`
- Modify: `src/app/mentions-legales/page.tsx`
- Modify: `src/app/og-image.png/route.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Appliquer la table de correspondance**

- [ ] **Step 2: Commit**

```bash
git add src/app/onboarding/ src/app/mentions-legales/ src/app/og-image.png/ src/app/admin/
git commit -m "feat: charte Minuit Électrique — onboarding, mentions légales, OG image, admin"
```

---

### Task 8: Vérification finale

- [ ] **Step 1: Grep pour anciennes couleurs restantes**

```bash
grep -rn "#F5EDD6\|#EDE0C4\|#C8813A\|#A86828\|#2C2018\|#130e07\|#6B4F38\|#E07A5F\|#c96a50\|#F4F1DE\|#f0dfc0\|#a07840\|#1e1610\|#c87830" src/
```

Si résultats : corriger et commiter.

- [ ] **Step 2: Vérifier visuellement chaque zone**

- Homepage marketing
- App consumer (discover, explore, search, shop, product, favorites, profile)
- Auth (login, signup)
- Dashboard (home, products, stock, settings)
- Onboarding
- Mentions légales

- [ ] **Step 3: Mettre à jour le DESIGN-SYSTEM.md**

Mettre à jour `charte graphique/DESIGN-SYSTEM.md` pour refléter le thème clair (plus "full dark mode").
