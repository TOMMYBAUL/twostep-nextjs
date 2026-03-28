# Checklist qualité OBLIGATOIRE — Remotion / Motion Design

> **RÈGLE ABSOLUE :** Ce document DOIT être lu AVANT toute création de vidéo ou motion design avec Remotion.
> Ne JAMAIS coder directement. Suivre chaque étape dans l'ordre. Aucune exception.

---

## Étape 1 — Direction artistique (AVANT de coder)

### Skills à invoquer OBLIGATOIREMENT :

**1.1 — `brand`**
- Charger les brand guidelines Two-Step
- Vérifier : palette de couleurs, ton de voix, typographie, espacement
- Si `docs/brand-guidelines.md` n'existe pas → le créer d'abord via ce skill

**1.2 — `ui-ux-pro-max`**
- Demander une recommandation de style pour le type de vidéo (SaaS, commerce local, premium)
- Récupérer : palette couleurs recommandée, font pairing, spacing scale
- Appliquer le style qui correspond au positionnement Two-Step : **sobre, classe, confiant**

**1.3 — `design-system`**
- Vérifier que les design tokens (couleurs, typo, spacing) sont cohérents avec le site web
- Les tokens Remotion doivent être IDENTIQUES au site :
  ```
  ochre:      #C8813A
  cream:      #F5EDD6
  brown:      #2C2018
  sage:       #7A9E7E
  terracotta: #E07A5F
  ```

### Sortie attendue :
Un brief visuel écrit avec : palette, fonts, style d'animation, mood, références visuelles.

---

## Étape 2 — Contexte structuré + Script (AVANT de coder)

### 2.0 — Prompt contexte structuré (OBLIGATOIRE)
Avant le script, définir le contexte dans un format structuré :
```
- Projet : [description en 1 phrase]
- Durée : [15s / 30s / 60s]
- Format : [9:16 vertical / 16:9 horizontal]
- Audience : [marchands / consommateurs / investisseurs]
- Concept visuel : [3 mots-clés max — ex: minimaliste, premium, local]
- Identité sonore : [ambiance musicale souhaitée]
- Palette : [couleurs principales]
- Motion feel : [smooth / dynamique / calme]
- Mots-clés à éviter : [liste]
```

### Skills à invoquer OBLIGATOIREMENT :

**2.1 — `viral-hook-generator`**
- Générer 3-5 variantes de hook pour le sujet
- Choisir le plus percutant (tester les 4 formules : Contrarian, Benefit-Driven, Transformation, How-To)
- Adapter au français et au ton Two-Step (pas de jargon startup, parler comme un commerçant)

**2.2 — `platform-voice-adapter`**
- Adapter le ton au format cible (TikTok = ultra-direct, LinkedIn = professionnel, Email = personnel)
- Vérifier les limites de durée par plateforme

**2.3 — `creator-style-mimic` (optionnel)**
- Si besoin d'un ton spécifique, charger un profil créateur comme référence
- Two-Step = mix Codie Sanchez (direct, ROI) + authenticité locale

### Sortie attendue :
Script complet avec : hook (3s), body (15-20s), CTA (5s). Chaque mot choisi intentionnellement.

---

## Étape 2b — Audio FIRST (AVANT les visuels)

> **RÈGLE ABSOLUE :** L'audio se génère AVANT les visuels. Les visuels se calent sur l'audio, pas l'inverse.

### Processus :

**2b.1 — Générer la voix off**
- Utiliser **ElevenLabs** (qualité supérieure) ou Edge TTS (gratuit, fallback)
- ElevenLabs : voix "Adam" ou "Rachel" en français, ou voix clonée de Thomas
- Le script de l'étape 2 est envoyé à ElevenLabs via API (clé API nécessaire : `ELEVEN_LABS_API_KEY`)
- Récupérer le fichier audio + les timings mot par mot

**2b.2 — Générer la musique d'ambiance (optionnel)**
- ElevenLabs sound effects ou musique libre de droits
- Volume : 15-25% du volume de la voix off
- Ambiance cohérente avec le contexte (ex: urbain pour commerce local)

**2b.3 — Mesurer la durée réelle**
- La durée audio dicte la durée de chaque slide
- Chaque segment du script = un écran visuel
- Les visuels se calent sur les timings audio, pas l'inverse

### Sortie attendue :
Fichier(s) audio MP3 + timings par segment pour synchroniser les visuels.

---

## Étape 3 — Recherche visuelle (AVANT de coder)

### MCP à utiliser OBLIGATOIREMENT :

**3.1 — `firecrawl` ou `ddg-search`**
- Chercher 3-5 exemples de motion design de référence dans le même domaine (SaaS, commerce local)
- Analyser : quelles transitions, quel rythme, quel style typo, quel ratio texte/visuel

**3.2 — `playwright`**
- Ouvrir les références trouvées
- Prendre des screenshots des moments clés pour s'en inspirer

**3.3 — `context7`**
- Charger la documentation Remotion à jour pour les techniques nécessaires (animations, springs, transitions, séquences)

### Sortie attendue :
3 références visuelles analysées avec les éléments à reprendre.

---

## Étape 4 — Page HTML de référence (AVANT de coder Remotion)

> **MÉTHODE OBLIGATOIRE :** Ne JAMAIS coder Remotion directement.
> D'abord créer une page HTML statique magnifique, puis la transformer en vidéo.

### Processus en 2 phases :

**Phase A — Créer le HTML de référence**

1. Utiliser les skills `design`, `ui-ux-pro-max`, `ui-styling` pour créer une **page HTML statique** qui représente visuellement le contenu de la vidéo
2. Cette page doit être belle, soignée, avec les bonnes couleurs, typo, spacing
3. Chaque section de la page = un écran de la vidéo
4. Utiliser Tailwind, animations CSS, design tokens Two-Step
5. Ouvrir la page dans le navigateur via `playwright` pour vérifier le rendu
6. Itérer jusqu'à ce que le HTML soit visuellement parfait

**Phase B — Transformer en Remotion**

1. Donner le fichier HTML à Claude avec le prompt : "Transforme ce HTML en vidéo Remotion, écran par écran, avec des transitions fluides"
2. Le skill `remotion-best-practices` (déjà installé) guide la génération
3. Claude a une référence visuelle concrète → le résultat est fidèle au design

**Pourquoi cette méthode fonctionne :**
- Le design est fait AVANT le code vidéo (séparation des préoccupations)
- L'IA est meilleure pour créer du beau HTML que du beau Remotion directement
- On peut valider visuellement le HTML avant de le transformer en vidéo
- Le skill remotion-best-practices optimise la conversion HTML → vidéo

**4.2 — Validation**
- Montrer le HTML de référence à Thomas AVANT de convertir en Remotion
- Attendre son approbation sur le design
- Puis convertir

### Sortie attendue :
Un fichier HTML magnifique + son équivalent Remotion fidèle.

---

## Étape 5 — Principes d'animation (PENDANT le code)

### Règles NON NÉGOCIABLES :

**Typographie :**
- Taille minimum : 48px pour les titres, 32px pour le body
- Font weight : 800 pour les titres, 600 pour le body, 400 pour les légendes
- Line height : 1.1 pour les titres, 1.4 pour le body
- Letter spacing : -0.03em pour les titres
- JAMAIS de texte centré sur plus de 2 lignes (aligner à gauche)
- JAMAIS de paragraphes longs — maximum 12 mots par écran

**Animations :**
- Durée : 300-600ms pour les entrées, 200-400ms pour les sorties
- Easing : `[0.22, 1, 0.36, 1]` (ease-out premium) — JAMAIS de linear ou ease-in
- Spring : `config({ damping: 15, stiffness: 120 })` pour du naturel sans bounce
- JAMAIS de bounce, JAMAIS de elastic — ça fait amateur
- Délai entre éléments : 100-200ms (stagger) — JAMAIS tout en même temps
- Les éléments entrent par le bas (translateY: 20-40px → 0) ou par l'opacité (0 → 1)
- JAMAIS d'entrée par la gauche ou la droite (sauf split screen intentionnel)

**Composition :**
- Margins : minimum 60px sur les côtés (format 1080x1920)
- JAMAIS de texte qui touche les bords
- Espacement vertical généreux — mieux vaut trop d'espace que pas assez
- Maximum 3 éléments visuels par écran
- Point focal unique par écran — l'oeil doit savoir où regarder

**Couleurs :**
- Fond sombre (#2C2018) = texte crème (#F5EDD6) + accents ochre (#C8813A)
- Fond clair (#F5EDD6) = texte brun (#2C2018) + accents ochre (#C8813A)
- JAMAIS plus de 3 couleurs par écran
- Les couleurs d'accent (ochre, sage) sont pour les mots-clés, pas pour les blocs entiers

**Transitions entre écrans :**
- Fade cross-dissolve (300ms) = par défaut
- Wipe vertical = pour les ruptures narratives
- JAMAIS de transition flashy (zoom, rotate, flip)

---

## Étape 6 — Assets & enrichissement (PENDANT le code)

### 6.1 — SVG générés par Claude (PRÉFÉRÉ aux images importées)
> **Méthode clé :** Au lieu d'importer des PNG/JPG statiques, demander à Claude de GÉNÉRER des SVG animables.
> Claude comprend la structure des SVG qu'il crée → il peut les animer (ailes qui battent, objets qui bougent).

- Pour chaque élément visuel, générer un SVG avec des parties séparées et nommées
- Exemple : un sac de courses avec une anse qui bouge, un téléphone avec un écran qui s'allume
- Les SVG sont plus légers, scalables, et animables que les images

### 6.2 — `nano-banana-2` (Gemini image generation)
- Pour les visuels réalistes (photos de produits, backgrounds photo)
- Style : minimaliste, flat design, palette Two-Step

### 6.3 — `banner-design`
- Pour les écrans de type "carte" ou "badge" dans la vidéo

### 6.4 — `playwright`
- Capturer des screenshots de l'app Two-Step réelle pour les intégrer dans la vidéo

### Remotion best practices (skill installé) :
- Utiliser `@remotion/transitions` pour les transitions inter-séquences
- Utiliser `staticFile()` pour les assets locaux
- Utiliser `interpolate()` avec `Easing.bezier()` pour les animations custom
- Utiliser `<Audio>` pour la voix off ET la musique de fond
- Utiliser `<Sequence>` pour organiser le timing calé sur l'audio

---

## Étape 7 — Vérification finale (APRÈS le code)

### Checklist de qualité :

- [ ] Le hook accroche en moins de 2 secondes
- [ ] Chaque écran a maximum 12 mots
- [ ] Les animations sont fluides (pas de saccade)
- [ ] Le texte ne touche jamais les bords
- [ ] Maximum 3 couleurs par écran
- [ ] Les transitions sont douces (fade, pas de bounce)
- [ ] Le CTA est clair et visible
- [ ] La vidéo fonctionne SANS le son (sous-titres lisibles)
- [ ] Le logo Two-Step est visible mais discret
- [ ] La durée totale respecte le format cible (15s, 30s, 60s)
- [ ] Le rendu est testé en 1080x1920 (vertical)

### Skill à invoquer :
**`superpowers:verification-before-completion`**
- Revoir la vidéo générée avec un oeil critique
- Comparer avec les références de l'étape 3

---

## Résumé des invocations obligatoires

| Étape | Skills | MCP |
|-------|--------|-----|
| 1. Direction artistique | `brand`, `ui-ux-pro-max`, `design-system` | — |
| 2. Script | `viral-hook-generator`, `platform-voice-adapter` | — |
| 3. Recherche | — | `firecrawl`, `playwright`, `context7` |
| 4. Storyboard | — | — |
| 5. Animation | (règles internes) | — |
| 6. Assets | `nano-banana-2`, `banner-design` | `playwright` |
| 7. Vérification | `verification-before-completion` | — |

---

## Étape 8 — Préréglage .md (APRÈS validation)

> **Métaphore sculpture :** La V1 est un bloc de marbre. On itère avec les retours de Thomas
> (modifie ci, change ça, j'aime pas ça). Une fois que le résultat plaît → on sauvegarde le préréglage.

### Processus :

**8.1 — Sauvegarder le style validé**

Une fois que Thomas valide une vidéo, créer un fichier `.md` de préréglage :

```
docs/remotion-presets/[nom-du-preset].md
```

Ce fichier doit contenir TOUTES les informations pour reproduire le style :
- Le prompt contexte utilisé
- Le script et sa structure
- Les couleurs, fonts, spacing utilisés
- Les types d'animations et leurs paramètres (easing, durée, delay)
- Les types de SVG générés
- Le style audio (voix, ambiance)
- Les exemples de ce qui a marché et ce qui n'a pas marché

**8.2 — Réutiliser un préréglage**

Pour créer une nouvelle vidéo basée sur un préréglage existant :
```
"En te basant sur le preset [nom-du-preset].md, crée une vidéo sur [nouveau sujet]."
```

Claude reproduira le même style sans tout réinventer.

**8.3 — Itérer le préréglage**

Chaque correction de Thomas améliore le preset. Mettre à jour le .md après chaque itération.

---

## Ce qui est INTERDIT

- ❌ Coder une vidéo Remotion sans avoir fait les étapes 1-4
- ❌ Utiliser des animations bounce, elastic, ou flashy
- ❌ Mettre du texte qui touche les bords
- ❌ Utiliser plus de 3 couleurs par écran
- ❌ Faire des paragraphes de plus de 12 mots par écran
- ❌ Utiliser linear easing
- ❌ Ne pas présenter le storyboard à Thomas avant de coder
- ❌ Ignorer les brand guidelines
- ❌ Faire du "design de développeur" — chaque pixel compte
