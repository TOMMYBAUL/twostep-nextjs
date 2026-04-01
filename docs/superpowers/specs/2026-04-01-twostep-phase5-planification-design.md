# Two-Step — Phase 5 : Planification page par page

> Spec validée le 1er avril 2026 — Phase 5 du redesign frontend

---

## 1. Ordre d'exécution

### Bloc 1 — Homepage (refonte complète)

| # | Page/Composant | Ce qui change | Référence Phase 4 |
|---|----------------|---------------|-------------------|
| 1.1 | Setup motion global | Lenis smooth scroll, spring constants, prefers-reduced-motion | §4.3, §4.4, §4.5 |
| 1.2 | Navbar homepage | Fixed, transparente → glassmorphism au scroll | §4.6 |
| 1.3 | Section Hero | Fond dark, titre spring cascade, parallax 0.3× | §4.2 Hero |
| 1.4 | Section Ticker | Défilement infini CSS, noms boutiques | §4.2 Ticker |
| 1.5 | Section Comment ça marche | 3 étapes, mockup sticky (desktop), screenshots (mobile) | §4.2 Comment ça marche |
| 1.6 | Section Stats | Compteurs animés 0→valeur, stagger 150ms | §4.2 Stats |
| 1.7 | Section Marchands | CTA B2B noir, slide-up cascade | §4.2 Marchands |
| 1.8 | Section CTA final | Fond bleu, scale-up, bouton pulse | §4.2 CTA final |
| 1.9 | Footer | Dark, liens centrés, compact | §4.1 |
| 1.10 | Responsive mobile | Mêmes animations, layout adapté | §4.7 |

### Bloc 2 — App consumer (polish visuel)

| # | Page/Composant | Ce qui change | Référence Phase 4 |
|---|----------------|---------------|-------------------|
| 2.1 | Cards produit | Modèle B (nom + boutique & distance + prix), hover scale 1.03, favori rond blanc | §2.2 |
| 2.2 | Fiche produit | Carrousel photos + dots, barre sticky (J'arrive + Itinéraire), boutons partage+favori, badge "Plus que X" si stock ≤3, tailles disponibles uniquement | §2.5 |
| 2.3 | Fiche boutique | Cover immersive + gradient, logo sur cover, boutons sociaux, tabs Catalogue/Promos/Suggestions | §2.4 |
| 2.4 | Onglet Promos | Liste compacte A (image gauche, infos droite), badge % bleu, urgence orange | §2.3 |
| 2.5 | Page Profil | Carousel favoris horizontal, avatars boutiques suivies, sections cliquables, bouton désactiver animations | §2.6 |
| 2.6 | Empty states | Icônes 3D Thiings remplacent les emojis/texte vide, CTA vers action logique | §2.8 |
| 2.7 | Animations globales | Spring transitions (stiffness: 200, damping: 30) sur toutes les pages, transitions 100ms hover, slide-up au scroll | §4.4, §4.5 |

### Bloc 3 — Dashboard (refonte sobre)

| # | Page/Composant | Ce qui change | Référence Phase 4 |
|---|----------------|---------------|-------------------|
| 3.1 | Sidebar | Style sobre (fond #FAFAFA, bordures fines, pas d'emoji), item actif en gris | §3.1 |
| 3.2 | Page Accueil | 4 métriques (J'arrive en bleu), onboarding barre de progression, tip coach bordure bleue | §3.2 |
| 3.3 | Page Produits | Métriques stock colorées, tableau avec miniature + prix + contrôles ± + badge état, rupture en opacité 0.5 | §3.3 |
| 3.4 | Page Ma boutique | 5 sections (cover + logo + infos + adresse + horaires), "Voir ma page ↗", 1 bouton Enregistrer | §3.4 |
| 3.5 | Page Réglages | 3 sections (POS + réseaux sociaux + compte), pas de photos IA | §3.5 |
| 3.6 | Version mobile | Bottom bar 5 onglets, métriques 2×2, cards horizontales | §3.6 |

---

## 2. Critères de succès visuel

### Pour chaque page, on vérifie :

1. **Cohérence typographique** — Archivo Black pour les titres, Barlow pour les noms/prix, Inter pour les labels. Weights et letter-spacing conformes à la spec Phase 4.
2. **Couleurs CSS vars uniquement** — Aucune couleur hardcodée. Tout passe par les variables `--ts-*`.
3. **Animations spring** — Les éléments interactifs utilisent `{ type: "spring", stiffness: 200, damping: 30 }`. Les transitions hover sont en 100ms linear.
4. **Responsive** — Même contenu desktop et mobile. Mêmes animations. Layout adapté.
5. **Empty states** — Chaque liste vide a son icône Thiings 3D + message + CTA.
6. **Accessibilité** — `role` et `aria-*` sur les éléments interactifs. `prefers-reduced-motion` respecté.
7. **Build propre** — `npm run build` passe sans erreur après chaque page.

### Critères spécifiques par bloc :

**Homepage :**
- Le scroll est fluide (Lenis activé)
- Le parallax hero fonctionne sans lag
- Les compteurs stats s'animent quand ils entrent dans le viewport (une seule fois)
- Le mockup sticky fonctionne sur desktop, se dégrade proprement en mobile
- La navbar change d'état au scroll

**App consumer :**
- Les cards produit ont le hover scale sur desktop, pas sur mobile (touch)
- La barre sticky fiche produit est toujours visible même en scrollant
- Les tailles affichées sont uniquement celles en stock
- Le carousel photos fonctionne au swipe
- Les icônes Thiings sont chargées et affichées correctement

**Dashboard :**
- La sidebar n'a plus d'emoji
- Les métriques stock ont les bonnes couleurs (vert/orange/rouge)
- Les contrôles ± fonctionnent
- La bottom bar mobile a 5 onglets
- Le style est sobre — pas de fond crème, pas de gamification

---

## 3. Fichiers de référence

| Document | Contenu |
|----------|---------|
| `docs/superpowers/specs/2026-04-01-twostep-phase4-moodboards-design.md` | Toutes les décisions visuelles (direction, couleurs, typo, motion, composants) |
| `twostep-nextjs/Inspiration concurrent/` | HTML source des concurrents (Vinted, Instagram, Deliveroo, TGTG, Frameship, StringTune) |
| `src/lib/categories.ts` | CATEGORY_SEO pour les pages SEO |
| `src/hooks/use-categories.ts` | Hook React Query pour les catégories dynamiques |
| `src/app/(consumer)/components/` | Composants consumer existants (feed-header, category-pills, etc.) |

---

## 4. Dépendances techniques

| Librairie | Version | Rôle | Statut |
|-----------|---------|------|--------|
| `motion` | v12 | Animations spring, useInView, useScroll | ✅ Installé |
| `lenis` | latest | Smooth scroll homepage | ✅ Installé |
| `react-swipeable` | latest | Swipe gestures (header, carousel) | ✅ Installé |
| `vaul` | v1.1 | Bottom sheets, drawers | ✅ Installé |
| `@anthropic-ai/sdk` | latest | Auto-catégorisation IA | ✅ Installé (clé API à ajouter) |

---

## 5. Ce qui ne change PAS dans cette phase

- Backend / API routes
- Base de données (migrations déjà faites en Phase 3)
- Système de follows, favoris, "J'arrive"
- POS sync engine
- Pipeline images (rembg)
- Pages SEO (toulouse/[category], [city]/[category])
