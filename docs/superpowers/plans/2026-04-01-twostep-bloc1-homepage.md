# Two-Step Bloc 1 — Homepage Refonte Complète

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre la homepage Two-Step en storytelling vertical avec motion design (parallax, sticky mockup, compteurs animés, smooth scroll Lenis) en suivant la direction visuelle Phase 4 "Clean base + Bold accents".

**Architecture:** La homepage actuelle (`src/app/(marketing)/`) a déjà des sections modulaires (nav, hero, marquee, how, about, etc.) avec Framer Motion. On **réécrit chaque section** pour passer du style actuel (fond blanc, orienté marchands B2B) au nouveau style (alternance dark/light, orienté consumers, motion design scroll-driven). On ajoute Lenis pour le smooth scroll, on crée un fichier de constantes motion partagées, et on restructure les sections selon la spec Phase 4+5.

**Tech Stack:** Next.js 15, React 19, motion v12 (Framer Motion), Lenis (smooth scroll), Tailwind CSS v4.1, @untitledui/icons

**Structure cible des sections :**
1. Hero (dark) — parallax + spring cascade
2. Ticker (dark) — noms boutiques défilants (remplace le ticker actuel "COMMERCE LOCAL")
3. Comment ça marche (light) — 3 étapes + mockup sticky
4. Stats (dark) — compteurs animés
5. Pour les marchands (light) — CTA B2B
6. CTA final (bleu #4268FF) — scale-up + pulse
7. Footer (dark)

---

## File Map

| Action | Fichier | Responsabilité |
|--------|---------|---------------|
| Create | `src/lib/motion.ts` | Constantes spring + hooks motion partagés |
| Create | `src/app/(marketing)/components/lenis-provider.tsx` | Provider Lenis smooth scroll |
| Modify | `src/app/(marketing)/home-screen.tsx` | Nouvelle structure 7 sections |
| Modify | `src/app/(marketing)/sections/nav.tsx` | Navbar fixed, transparente → glassmorphism |
| Modify | `src/app/(marketing)/sections/hero.tsx` | Fond dark, parallax, spring cascade |
| Modify | `src/app/(marketing)/sections/marquee.tsx` | Noms de boutiques réels, fond dark |
| Modify | `src/app/(marketing)/sections/how.tsx` | 3 étapes consumer + mockup sticky |
| Modify | `src/app/(marketing)/sections/statement.tsx` | Devient "Stats" — compteurs seuls |
| Modify | `src/app/(marketing)/sections/contact.tsx` | Devient "Pour les marchands" — CTA B2B |
| Create | `src/app/(marketing)/sections/cta-final.tsx` | Section CTA bleu + scale-up |
| Modify | `src/app/(marketing)/sections/footer.tsx` | Dark compact |
| Delete | `src/app/(marketing)/sections/about.tsx` | Supprimé (fusionné dans d'autres sections) |
| Delete | `src/app/(marketing)/sections/pioneers.tsx` | Supprimé (fusionné dans stats) |
| Modify | `src/app/(marketing)/utils.tsx` | Garder Counter, hooks. Supprimer E, FloatCard. |
| Delete | `src/app/(marketing)/components/background-paths.tsx` | Supprimé |
| Delete | `src/app/(marketing)/components/location-tag.tsx` | Supprimé |
| Delete | `src/app/(marketing)/components/spotlight-card.tsx` | Supprimé |
| Delete | `src/app/(marketing)/components/glow-input.tsx` | Supprimé |
| Delete | `src/app/(marketing)/components/lottie-icon.tsx` | Supprimé |
| Modify | `src/app/(marketing)/layout.tsx` | Ajouter LenisProvider |

---

## Task 1: Constantes motion + Lenis provider

**Files:**
- Create: `src/lib/motion.ts`
- Create: `src/app/(marketing)/components/lenis-provider.tsx`
- Modify: `src/app/(marketing)/layout.tsx` (si existe, sinon page.tsx)

- [ ] **Step 1: Créer `src/lib/motion.ts`**

```typescript
/** Shared motion constants — used across all animated pages */

/** Default spring for UI elements (slide-up, indicators, tabs) */
export const SPRING = { type: "spring" as const, stiffness: 200, damping: 30 };

/** Softer spring for visual elements (images, mockups, scale-up) */
export const SOFT_SPRING = { type: "spring" as const, stiffness: 150, damping: 30 };

/** Slide-up animation preset */
export const slideUp = (delay = 0) => ({
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    transition: { ...SPRING, delay },
});

/** Scale-up animation preset */
export const scaleUp = (delay = 0) => ({
    initial: { opacity: 0, y: 40, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { ...SOFT_SPRING, delay },
});

/** Stagger delay calculator: 50ms per element */
export const stagger = (index: number, base = 0) => base + index * 0.05;
```

- [ ] **Step 2: Créer `src/app/(marketing)/components/lenis-provider.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export function LenisProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
        });

        function raf(time: number) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        return () => lenis.destroy();
    }, []);

    return <>{children}</>;
}
```

- [ ] **Step 3: Intégrer LenisProvider dans le layout marketing**

Lire `src/app/(marketing)/layout.tsx` s'il existe. Si oui, wrapper le children avec `<LenisProvider>`. Si non, modifier `home-screen.tsx` pour ajouter le provider.

- [ ] **Step 4: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/lib/motion.ts src/app/\(marketing\)/components/lenis-provider.tsx
git commit -m "feat(Homepage): add motion constants + Lenis smooth scroll provider"
```

---

## Task 2: Navbar — transparente → glassmorphism

**Files:**
- Modify: `src/app/(marketing)/sections/nav.tsx`

- [ ] **Step 1: Réécrire nav.tsx**

Remplacer le contenu complet de nav.tsx. La nouvelle navbar :
- Position fixed, z-index 100
- Fond transparent au départ, glassmorphism au scroll (> 100px)
- Logo Two-Step + liens "Comment ça marche" / "Marchands" + CTA "Découvrir"
- Mobile : logo + CTA uniquement
- Utiliser `useScroll` + `useTransform` de motion pour le fond
- Supprimer les styles CSS injectés (`dangerouslySetInnerHTML`) — tout en Tailwind

```typescript
"use client";

import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";
import Link from "next/link";

export function Nav() {
    const { scrollY } = useScroll();
    const [scrolled, setScrolled] = useState(false);

    useMotionValueEvent(scrollY, "change", (latest) => {
        setScrolled(latest > 100);
    });

    return (
        <motion.nav
            className={`fixed inset-x-0 top-0 z-[100] flex items-center justify-between px-6 transition-all duration-300 md:px-12 ${
                scrolled
                    ? "h-14 bg-[#1A1F36]/85 backdrop-blur-xl shadow-sm"
                    : "h-16 bg-transparent"
            }`}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
            <Link href="/" className="flex items-center gap-2.5">
                <img src="/logo-icon.webp?v=2" alt="" width={28} height={28} className="rounded-md" />
                <span className="text-[15px] font-[800] tracking-tight text-white">Two-Step</span>
            </Link>

            <div className="flex items-center gap-3">
                <a href="#comment" className="hidden text-[13px] text-white/60 hover:text-white/90 transition-colors md:block">
                    Comment ça marche
                </a>
                <a href="#marchands" className="hidden text-[13px] text-white/60 hover:text-white/90 transition-colors md:block">
                    Marchands
                </a>
                <Link
                    href="/discover"
                    className="rounded-lg bg-[#4268FF] px-4 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90 md:px-5 md:text-[13px]"
                >
                    Découvrir
                </Link>
            </div>
        </motion.nav>
    );
}
```

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/nav.tsx
git commit -m "feat(Homepage): navbar transparent → glassmorphism on scroll"
```

---

## Task 3: Hero — fond dark + parallax + spring cascade

**Files:**
- Modify: `src/app/(marketing)/sections/hero.tsx`

- [ ] **Step 1: Réécrire hero.tsx**

Le nouveau hero :
- Fond dark `#1A1F36` (pas blanc)
- Pas de BackgroundPaths, pas de FloatCard, pas de LocationTag
- Parallax : le fond bouge à 0.3× via `useScroll` + `useTransform`
- Titre : "Le stock de ton quartier, à deux pas de chez toi" — spring cascade (titre, sous-titre +0.1s, CTA +0.2s)
- Sous-titre : "Découvre ce qui est disponible maintenant dans les boutiques autour de toi."
- CTA : "Découvrir les boutiques →" (bleu `#4268FF`)
- Mention : "Gratuit · Pas besoin de compte pour explorer"
- 100svh min-height
- Pas de mockup téléphone dans le hero (c'est dans "Comment ça marche")
- Import `SPRING` et `stagger` depuis `@/lib/motion`

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/hero.tsx
git commit -m "feat(Homepage): dark hero with parallax + spring cascade"
```

---

## Task 4: Ticker — noms de boutiques réels

**Files:**
- Modify: `src/app/(marketing)/sections/marquee.tsx`

- [ ] **Step 1: Mettre à jour marquee.tsx**

Changer le contenu du ticker : remplacer "COMMERCE LOCAL · STOCK VISIBLE · TEMPS RÉEL · TOULOUSE ·" par les noms de vraies boutiques : "SNEAKERS DISTRICT · LA FRIPERIE TOULOUSAINE · CAVE VICTOR HUGO · LIBRAIRIE OMBRES · SPORT CONCEPT · BIJOUX SANDRA ·"

Changer le fond : de `#4268FF` (bleu) à `#1A1F36` (dark, même que hero) avec texte en `rgba(255,255,255,0.25)`.

Garder l'animation motion identique (translate x 0% → -50%, 22s, linear, Infinity).

Ajouter les optimisations GPU : `will-change: transform` sur le motion.div.

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/marquee.tsx
git commit -m "feat(Homepage): ticker with real shop names on dark background"
```

---

## Task 5: Comment ça marche — 3 étapes consumer + mockup sticky

**Files:**
- Modify: `src/app/(marketing)/sections/how.tsx`

- [ ] **Step 1: Réécrire how.tsx**

Le nouveau "Comment ça marche" :
- Fond blanc `#FFFFFF`
- Label "COMMENT ÇA MARCHE" en bleu, petites capitales
- Titre "En 3 étapes" bold 22px
- Desktop : layout 2 colonnes. Gauche = mockup téléphone sticky (`position: sticky; top: 80px`). Droite = 3 étapes qui scrollent.
- Mobile : chaque étape a son screenshot AU-DESSUS du texte, pas de sticky.
- Le mockup change d'image (crossfade) quand une étape entre dans le viewport (useInView sur chaque étape).
- Étapes :
  1. "Cherche ton produit" — par catégorie, marque ou nom
  2. "Vérifie le stock en temps réel" — disponible maintenant, pas "en théorie"
  3. "Vas-y en 2 minutes" — préviens le marchand avec "J'arrive"
- Numéros en cercles (1 bleu, 2 noir, 3 noir) avec border-radius 12px
- Étape active : opacity 1 + bordure gauche bleue. Inactives : opacity 0.4.
- Pour le mockup : utiliser un simple div cadre de téléphone avec un placeholder. Les vrais screenshots seront ajoutés manuellement plus tard (fichiers dans `public/mockups/`).
- Import `SPRING` depuis `@/lib/motion`
- Supprimer SpotlightCard import

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/how.tsx
git commit -m "feat(Homepage): 3-step section with sticky phone mockup + crossfade"
```

---

## Task 6: Stats — compteurs animés

**Files:**
- Modify: `src/app/(marketing)/sections/statement.tsx`

- [ ] **Step 1: Réécrire statement.tsx en section Stats**

La nouvelle section Stats :
- Fond dark `#1A1F36`
- 3 compteurs : "50+" boutiques, "5 000+" produits, "Toulouse" (et bientôt d'autres villes)
- Utiliser le composant `Counter` existant dans `utils.tsx`
- Compteurs animés quand la section entre dans le viewport (useInView, once: true)
- Stagger 150ms entre chaque compteur
- Desktop : 3 colonnes. Mobile : 2+1 (grille 2 colonnes + "Toulouse" plein largeur en dessous)
- Chiffres bold 28px blanc, labels 12px blanc/50%
- Pas de texte "À propos" ni de paragraphe descriptif — juste les chiffres
- Supprimer tout le contenu actuel de statement.tsx

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/statement.tsx
git commit -m "feat(Homepage): animated stats section with staggered counters"
```

---

## Task 7: Pour les marchands — CTA B2B

**Files:**
- Modify: `src/app/(marketing)/sections/contact.tsx`

- [ ] **Step 1: Réécrire contact.tsx en section Marchands**

La nouvelle section "Pour les marchands" :
- Fond blanc `#FFFFFF`
- id="marchands" (pour le lien dans la navbar)
- Label "VOUS ÊTES COMMERÇANT ?" en bleu, petites capitales
- Titre "Rendez votre stock visible" bold 22px
- Sous-titre : "Connectez votre caisse en 2 minutes. Gratuit pour commencer."
- 3 bullet points :
  - Compatible Square, Shopify, Lightspeed, SumUp, Zettle
  - Stock synchronisé automatiquement toutes les 15 min
  - Dashboard avec métriques et conseils personnalisés
- CTA : "Inscrire ma boutique →" en noir `#1A1A1A` (pas bleu — différencier B2B du consumer)
- Le CTA pointe vers `/onboarding`
- Animation : slide-up spring cascade (titre, texte +100ms, CTA +200ms)
- Supprimer le formulaire Formspree et le GlowInput

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/contact.tsx
git commit -m "feat(Homepage): B2B merchant section with black CTA"
```

---

## Task 8: CTA final — section bleue + scale-up

**Files:**
- Create: `src/app/(marketing)/sections/cta-final.tsx`

- [ ] **Step 1: Créer cta-final.tsx**

```typescript
"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Link from "next/link";
import { scaleUp } from "@/lib/motion";

export function CTAFinal() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-15%" });

    return (
        <motion.section
            ref={ref}
            className="bg-[#4268FF] px-6 py-16 text-center md:px-12 md:py-20"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ type: "spring", stiffness: 150, damping: 30 }}
        >
            <h2 className="mx-auto max-w-md text-[22px] font-[900] leading-tight tracking-tight text-white md:text-[28px]">
                Prêt à découvrir{" "}
                <br />
                ton quartier ?
            </h2>
            <p className="mt-3 text-[13px] text-white/65">
                Gratuit, sans compte, en 2 secondes.
            </p>
            <div className="mt-6">
                <Link
                    href="/discover"
                    className="inline-block rounded-xl bg-white px-7 py-3 text-[14px] font-[800] text-[#4268FF] transition-opacity hover:opacity-90"
                >
                    Découvrir →
                </Link>
            </div>
        </motion.section>
    );
}
```

Ajouter une animation pulse subtile sur le bouton :

```typescript
<motion.div
    className="mt-6"
    animate={{ scale: [1, 1.02, 1] }}
    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
>
    <Link ... />
</motion.div>
```

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/cta-final.tsx
git commit -m "feat(Homepage): blue CTA section with scale-up + pulse button"
```

---

## Task 9: Footer — dark compact

**Files:**
- Modify: `src/app/(marketing)/sections/footer.tsx`

- [ ] **Step 1: Réécrire footer.tsx**

Le nouveau footer :
- Fond `#0F1218` (très dark)
- Logo Two-Step + liens (Mentions légales, Contact, Marchands) + © 2026
- Desktop : row. Mobile : centré, colonne.
- Texte en `rgba(255,255,255,0.4)`
- Compact : padding 20px
- Supprimer les styles inline — tout en Tailwind

- [ ] **Step 2: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(marketing\)/sections/footer.tsx
git commit -m "feat(Homepage): compact dark footer"
```

---

## Task 10: Assembler — home-screen.tsx + nettoyage

**Files:**
- Modify: `src/app/(marketing)/home-screen.tsx`
- Delete: `src/app/(marketing)/sections/about.tsx`
- Delete: `src/app/(marketing)/sections/pioneers.tsx`
- Delete: `src/app/(marketing)/components/background-paths.tsx`
- Delete: `src/app/(marketing)/components/location-tag.tsx`
- Delete: `src/app/(marketing)/components/spotlight-card.tsx`
- Delete: `src/app/(marketing)/components/glow-input.tsx`
- Delete: `src/app/(marketing)/components/lottie-icon.tsx`
- Modify: `src/app/(marketing)/utils.tsx`

- [ ] **Step 1: Réécrire home-screen.tsx**

```typescript
"use client";

import { LenisProvider } from "./components/lenis-provider";
import { Nav } from "./sections/nav";
import { Hero } from "./sections/hero";
import { Marquee } from "./sections/marquee";
import { How } from "./sections/how";
import { Statement } from "./sections/statement";
import { Contact } from "./sections/contact";
import { CTAFinal } from "./sections/cta-final";
import { Footer } from "./sections/footer";

export default function HomeScreen() {
    return (
        <LenisProvider>
            <Nav />
            <main>
                <Hero />
                <Marquee />
                <How />
                <Statement />
                <Contact />
                <CTAFinal />
            </main>
            <Footer />
        </LenisProvider>
    );
}
```

- [ ] **Step 2: Supprimer les fichiers obsolètes**

```bash
rm src/app/\(marketing\)/sections/about.tsx
rm src/app/\(marketing\)/sections/pioneers.tsx
rm src/app/\(marketing\)/components/background-paths.tsx
rm src/app/\(marketing\)/components/location-tag.tsx
rm src/app/\(marketing\)/components/spotlight-card.tsx
rm src/app/\(marketing\)/components/glow-input.tsx
rm src/app/\(marketing\)/components/lottie-icon.tsx
```

- [ ] **Step 3: Nettoyer utils.tsx**

Supprimer `E` (easing constant, remplacé par SPRING dans motion.ts), `FloatCard` (composant supprimé), et les imports SpotlightCard. Garder `useIsMobile`, `useReducedMotion`, et `Counter`.

- [ ] **Step 4: Vérifier le build**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
```

Vérifier qu'aucun import orphelin ne reste :
```bash
grep -r "about\|pioneers\|BackgroundPaths\|LocationTag\|SpotlightCard\|GlowInput\|LottieIcon\|FloatCard" src/app/\(marketing\)/ --include="*.tsx" -l
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(Homepage): assemble new sections, remove obsolete components"
```

---

## Task 11: Build final + vérification

- [ ] **Step 1: Build complet**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -30
```

- [ ] **Step 2: Lancer le dev server et vérifier visuellement**

```bash
cd twostep-nextjs && PORT=3001 npx next dev --turbopack -p 3001
```

Ouvrir http://localhost:3001 et vérifier :
- Le scroll est smooth (Lenis)
- Le hero est dark avec parallax
- La navbar change au scroll
- Le ticker défile avec les noms de boutiques
- Le mockup est sticky sur desktop
- Les compteurs s'animent
- Le CTA final fait le scale-up
- Le tout est responsive sur mobile

- [ ] **Step 3: Commit final si nettoyage**

```bash
git add -A
git commit -m "chore(Homepage): final cleanup and verification"
```

---

## Résumé des commits

| # | Message | Scope |
|---|---------|-------|
| 1 | `feat(Homepage): add motion constants + Lenis smooth scroll provider` | Setup global |
| 2 | `feat(Homepage): navbar transparent → glassmorphism on scroll` | Nav |
| 3 | `feat(Homepage): dark hero with parallax + spring cascade` | Hero |
| 4 | `feat(Homepage): ticker with real shop names on dark background` | Ticker |
| 5 | `feat(Homepage): 3-step section with sticky phone mockup + crossfade` | How |
| 6 | `feat(Homepage): animated stats section with staggered counters` | Stats |
| 7 | `feat(Homepage): B2B merchant section with black CTA` | Marchands |
| 8 | `feat(Homepage): blue CTA section with scale-up + pulse button` | CTA |
| 9 | `feat(Homepage): compact dark footer` | Footer |
| 10 | `feat(Homepage): assemble new sections, remove obsolete components` | Assembly |
| 11 | `chore(Homepage): final cleanup and verification` | Cleanup |
