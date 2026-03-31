# Two-Step — Brand Guidelines v1.0

> Last updated: 2026-03-28
> Status: Active

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Color | #C8813A (ochre) |
| Secondary Color | #E07A5F (terracotta) |
| Dark Color | #2C2018 (brown) |
| Light Color | #F5EDD6 (cream) |
| Primary Font | Plus Jakarta Sans |
| Display Font | Fraunces (serif, titres marketing) |
| Voice | Sobre, classe, confiant |

---

## 1. Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Ochre | #C8813A | rgb(200,129,58) | Accent principal, CTAs, liens actifs, highlights |
| Ochre Light | #E8A85C | rgb(232,168,92) | Hover states, highlights texte vidéo |
| Ochre Dark | #A06A2E | rgb(160,106,46) | Variante sombre ochre |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Terracotta | #E07A5F | rgb(224,122,95) | Sidebar dashboard, accents chauds, boutons secondaires |
| Sage | #7A9E7E | rgb(122,158,126) | Succès, disponibilité, statuts positifs |
| Sage Light | #9ABFA0 | rgb(154,191,160) | Variante claire sage |

### Neutrals

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Brown (dark) | #2C2018 | rgb(44,32,24) | Fonds sombres, texte principal sur fond clair |
| Brown Light | #4A3828 | rgb(74,56,40) | Fonds secondaires sombres |
| Brown Mid | #6B4F38 | rgb(107,79,56) | Texte secondaire, descriptions |
| Cream | #F5EDD6 | rgb(245,237,214) | Fond clair principal, texte sur fond sombre |
| Cream Dark | #EBE3D3 | rgb(235,227,211) | Fond secondaire clair, cartes |

### Semantic Colors

| State | Hex | Usage |
|-------|-----|-------|
| Success | #7A9E7E (sage) | Disponible, validé, ouvert |
| Warning | #E8923A | Attention, stock faible |
| Error/Red | #D94F4F | Erreurs, fermé, destructif |
| Info | #4A90D9 | Position utilisateur, liens info |

---

## 2. Typography

### Font Stack

| Font | Weight | Usage |
|------|--------|-------|
| Plus Jakarta Sans | 400 | Body text, descriptions |
| Plus Jakarta Sans | 500 | Labels, navigation |
| Plus Jakarta Sans | 600 | Sous-titres, boutons |
| Plus Jakarta Sans | 700 | Titres de sections |
| Plus Jakarta Sans | 800 | Titres principaux, chiffres hero |
| Fraunces (serif) | 700-800 | Titres marketing site web uniquement |

### Scale

| Usage | Size | Weight | Letter-spacing |
|-------|------|--------|----------------|
| Hero title | clamp(48px, 5.5vw, 80px) | 800 | -0.035em |
| Section title | clamp(32px, 5vw, 64px) | 800 | -0.03em |
| Card title | 17px | 700 | -0.02em |
| Body | 14-16px | 400-500 | 0 |
| Small/caption | 11-12px | 500-600 | 0-0.06em |
| Label uppercase | 10-11px | 700 | 0.08-0.14em |

---

## 3. Voice & Tone

### Personnalité de marque
- **Sobre** — pas de jargon startup, pas d'exclamation excessive, pas d'emojis partout
- **Classe** — premium sans être élitiste, inspiré LV.com/Airbnb, pas startup fun
- **Confiant** — on affirme, on ne supplie pas, on ne fait pas de "on espère que..."

### Ton par contexte

| Contexte | Ton | Exemple |
|----------|-----|---------|
| Site marketing | Affirmé, direct, chiffré | "80% cherchent en ligne. Ils ne vous trouvent pas." |
| Dashboard marchand | Encourageant, coach | "Votre score progresse. Continuez." |
| App consumer | Décontracté, amical, tutoiement | "Découvre les boutiques autour de toi" |
| Email prospection | Personnel, entre pros, vouvoiement | "Votre stock est invisible. On peut changer ça." |
| Suggestions IA (tips) | Bienveillant, actionnable | "Ajoutez des photos à vos produits — ça attire 3× plus de clics." |

### Mots à utiliser
- "visible", "en temps réel", "à deux pas", "votre quartier"
- "zéro effort", "automatique", "en 30 secondes"
- "vos clients", "votre stock", "votre vitrine"

### Mots à éviter
- "révolutionnaire", "disruptif", "game-changer"
- "n'hésitez pas", "nous espérons", "nous serions ravis"
- "cliquez ici", "achetez maintenant"
- Jargon : "SaaS", "API", "sync", "pipeline", "webhook"

---

## 4. Visual Style

### Principes
- **Espaces négatifs généreux** — mieux vaut trop d'espace que pas assez
- **Maximum 3 couleurs par composition** — ochre + cream + brown ou ochre + sage + cream
- **Pas d'ombres portées lourdes** — ombres subtiles (0 6px 24px rgba(44,32,24,0.1))
- **Border-radius cohérent** — 10-16px pour les cartes, 8-10px pour les boutons, 999px pour les pills
- **Icônes ligne** — stroke 1.5px, pas de fill sauf état actif

### Animations (motion design)
- **Durée** : 300-600ms entrées, 200-400ms sorties
- **Easing** : `[0.22, 1, 0.36, 1]` (ease-out premium) — JAMAIS linear
- **Spring** : `damping: 15, stiffness: 120` — naturel, pas de bounce
- **Stagger** : 100-200ms entre éléments
- **Direction** : entrées par le bas (translateY: 20-40px → 0) ou opacité
- **INTERDIT** : bounce, elastic, rotate, flip, zoom agressif

### Compositions vidéo
- **Margins** : minimum 60px sur les côtés (1080x1920)
- **Max 12 mots par écran**
- **Max 3 éléments visuels par écran**
- **Point focal unique par écran**
- **Transitions** : fade cross-dissolve (300ms) par défaut

---

## 5. Logo

### Usage
- Logo texte "Two-Step" en Plus Jakarta Sans 800
- Logo icône : carré arrondi avec "T" blanc sur fond brown (#2C2018)
- Fichier : `/public/logo-icon.webp`
- Espacement minimum : hauteur du logo × 0.5 autour

### Restrictions
- Ne jamais modifier les proportions
- Ne jamais placer sur un fond qui réduit le contraste
- Ne jamais ajouter d'effets (ombre, glow, gradient)

---

## 6. Photographie

### Style produit
- Fond blanc (#FFFFFF) automatique via pipeline rembg
- Produit centré, 10% padding, 800×800px WebP
- Rendu type e-commerce premium (LV.com, Zalando)

### Style ambiance
- Lumière naturelle, chaleureuse
- Tons terreux, cohérents avec la palette
- Pas de filtres Instagram artificiels

---

## 7. Positionnement

### Tagline
"Le stock local, visible en temps réel."

### Proposition de valeur (une phrase)
"Two-Step rend votre stock visible aux consommateurs de votre quartier, automatiquement, en se connectant à votre caisse."

### Différenciateurs
1. Pas un e-commerce — pas de livraison, pas de commission
2. Pas Instagram — votre stock EST votre contenu, zéro création
3. Compatible avec 5 caisses (Square, Shopify, Lightspeed, SumUp, Zettle)
4. Photos fond blanc automatiques
5. Suggestions d'amélioration filtrées par IA
6. Réseau social sans le travail du contenu
