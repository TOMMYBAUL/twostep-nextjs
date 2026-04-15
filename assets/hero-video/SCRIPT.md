# Script Vidéo Hero — Two-Step Homepage (v3 FINAL)

> Ce document est le résultat de 4 recherches approfondies :
> Higgsfield.ai, meilleures hero vidéos SaaS, cohérence personnage IA, storytelling marketplace.
> Toutes les décisions sont argumentées par des données.

---

## INSIGHT CLÉ DE LA RECHERCHE

**Les marketplaces qui convertissent (Airbnb, Deliveroo, Vinted, TGTG, Uber) n'utilisent PAS de vidéo hero.** Elles privilégient la fonctionnalité immédiate (barre de recherche, géolocalisation). La vidéo hero est un choix de **branding premium** (Stripe, Apple) ou de **démo produit** (Notion).

**Notre choix assumé** : Two-Step est en phase de lancement — personne ne connaît le concept. La vidéo hero ne sert pas à convertir directement (c'est le titre + CTA qui font ça), elle sert à **faire comprendre le concept en 15 secondes sans un mot**. C'est un choix Notion (démo visuelle du parcours), pas un choix Stripe (ambiance abstraite).

---

## DIRECTION ARTISTIQUE

| Element | Valeur | Pourquoi |
|---------|--------|----------|
| Couleur vidéo | Tons chauds dominants, golden hour | Confiance + commerce local français (recherche : golden hour = quartier vivant et désirable) |
| Bleu #4268FF | N'apparaît QUE sur les écrans de téléphone | Crée un contraste chaud/froid qui raconte l'histoire : monde physique (chaud) vs digital (bleu confiance) |
| Overlay hero | `linear-gradient(rgba(10,12,20,0.75) 0%, rgba(10,12,20,0.4) 40%, rgba(10,12,20,0.2) 70%)` | Déjà en place, assure la lisibilité du texte blanc |
| Rythme | Posé, slow-motion subtil, 3 plans max | Recherche : les visiteurs ne restent que 3-5s en haut de page, le cerveau doit suivre en vision périphérique |
| Lumière | Golden hour, fin d'après-midi | Recherche : communique instantanément chaleur, authenticité, qualité de vie urbaine |

### Casting (validé par données)

**Commerçante : Femme, 35-40 ans**
- Cheveux bruns mi-longs attachés en queue basse
- Chemise blanche manches retroussées + tablier bleu marine
- Teint méditerranéen, sourire naturel (pas forcé)
- Bijoux discrets (montre simple, boucles d'oreilles petites)

**Consommateur : Homme, 25-28 ans**
- Cheveux bruns courts, barbe de 3 jours
- T-shirt blanc + veste légère beige/camel
- Style urbain décontracté, pas streetwear
- Tient un iPhone avec coque sombre

> **IMPORTANT** : Cette description doit être copiée IDENTIQUEMENT dans chaque prompt Nano Banana.
> C'est la "Couche 1 - Identité maître" qui ne change JAMAIS entre les prompts.

---

## PIPELINE DE PRODUCTION

### Phase 1 — Character Sheets (Nano Banana Pro)

Avant toute scène, générer les personnages de référence.
Nano Banana Pro accepte jusqu'à **14 images de référence** et peut maintenir la cohérence de **5 personnages**.

**Étape 1.1 — Portrait commerçante (3-4 angles)**

```
Generate a character reference sheet for a French boutique owner:
A woman, 35-40 years old, Mediterranean complexion, warm brown 
eyes, dark brown hair tied in a low ponytail. She wears a white 
linen shirt with rolled-up sleeves under a navy blue apron. 
Minimal jewelry — small gold stud earrings and a simple watch. 
Natural smile, confident posture.

Show her in 3 angles: front view, 3/4 left, 3/4 right.
Neutral studio lighting, white background, waist-up framing.
Photorealistic, high resolution.
```

**Étape 1.2 — Portrait consommateur (3-4 angles)**

```
Generate a character reference sheet for a young French man:
A man, 25-28 years old, light skin, short brown hair, 3-day 
stubble beard, brown eyes. He wears a plain white crew-neck 
t-shirt under a light beige/camel cotton jacket. Casual urban 
style, not streetwear. He holds a dark-cased iPhone in his 
right hand.

Show him in 3 angles: front view, 3/4 left, 3/4 right.
Neutral studio lighting, white background, waist-up framing.
Photorealistic, high resolution.
```

> Sauvegarder les character sheets dans `assets/hero-video/characters/`
> Les joindre comme images de référence à CHAQUE prompt suivant.

---

### Phase 2 — Les 5 images clés (Nano Banana Pro)

Le storyboard est compressé en **5 images clés** (pas 8). Recherche : 3-4 plans max pour 15-18 secondes. Les transitions Kling/Higgsfield feront le reste.

---

#### IMAGE 1 — La commerçante devant son écran

**Ce qu'on voit** : Intérieur d'une boutique de mode chaleureuse. La commerçante est derrière son comptoir en bois, devant un écran d'ordinateur. Elle regarde l'écran et sourit. On devine le dashboard Two-Step sur l'écran (interface blanche avec accents bleus). Lumière dorée de la vitrine. Vêtements sur portants en arrière-plan, mur en brique rose.

```
[Attach: character sheet commerçante + dashboard-marchand.jpeg]

A French boutique owner — woman, 35-40, Mediterranean complexion, 
dark brown hair in low ponytail, white linen shirt with rolled 
sleeves under navy blue apron, small gold stud earrings — standing 
behind a wooden counter in her boutique. She looks at a desktop 
computer screen showing a white dashboard with blue (#4268FF) 
accent elements (the Two-Step merchant dashboard, as shown in the 
reference image). She has a satisfied smile.

Background: clothing racks with colorful garments, exposed pink 
brick wall, warm pendant light. Golden hour sunlight streaming 
through the shop window on the left, creating warm highlights.

Camera: medium shot, slightly below eye level (makes her look 
authoritative), 35mm lens, f/2.8 shallow depth of field — screen 
and face sharp, background softly blurred. Cinematic color grading, 
warm tones. Photorealistic.
```

---

#### IMAGE 2 — La commerçante vérifie sur son téléphone

**Ce qu'on voit** : Plan plus large. La même commerçante, même boutique, mais maintenant elle tient son téléphone et regarde l'écran. Sur l'écran du téléphone on voit sa page boutique Two-Step avec des produits et des badges verts "En stock". Elle compare entre l'écran du PC et son téléphone. Expression satisfaite : "tout est là".

```
[Attach: character sheet commerçante + jarrive.jpeg comme ref UI]

Same French boutique owner — woman, 35-40, Mediterranean complexion, 
dark brown hair in low ponytail, white linen shirt under navy blue 
apron, gold stud earrings — now holding an iPhone in her right hand, 
looking at the phone screen with a satisfied expression. The phone 
screen displays a clean white shop profile page with product cards, 
blue (#4268FF) UI accents, and small green (#12B76A) stock badges.

The desktop computer is still visible on the counter behind her. 
Same boutique interior: clothing racks, pink brick wall, pendant 
light. Golden hour light from the window.

Camera: medium-wide shot, eye level, 35mm, f/2.8. The phone screen 
is visible and readable. Cinematic warm tones. Photorealistic.
```

---

#### IMAGE 3 — L'écran de la page boutique (plein cadre)

**Ce qu'on voit** : Gros plan de l'écran du téléphone montrant la page boutique Two-Step entièrement chargée. Photo de la boutique en haut, nom "Chez Simone", badge "Ouvert" vert, liste de produits avec photos, prix en euros, indicateurs de stock. Interface blanche, coins arrondis, bleu #4268FF. En fond très flou : les briques roses de la boutique.

```
[Attach: jarrive.jpeg + carte.jpeg comme références UI]

Extreme close-up of an iPhone screen showing a Two-Step shop profile 
page. At the top: a horizontal cover photo of a warm boutique 
interior, below it the shop name "Chez Simone" in bold dark text 
(#1A1F36), with a small green (#12B76A) "Ouvert" badge. 

Below: 3 product cards in a vertical list, each with a square 
product thumbnail on the left, product name and price in euros on 
the right, and a small green dot indicating "En stock". Products: 
a cashmere sweater (105€), white sneakers (89€), a leather handbag 
(149€). Clean white UI, 12px rounded corners, Inter/Barlow-style 
sans-serif font, blue (#4268FF) accent on interactive elements.

The phone is held by a hand (we see fingers on the edges). Very 
shallow DOF — the screen is razor sharp, the background is a warm 
blur of pink brick and golden light.

Photorealistic phone screen mockup with realistic glass reflections.
```

> **C'est l'image PIVOT** : elle sera le point de transition entre le monde marchand et le monde consommateur.

---

#### IMAGE 4 — Le consommateur dans la rue avec le même écran

**Ce qu'on voit** : Vue par-dessus l'épaule. Le consommateur (jeune homme) tient un iPhone montrant la MÊME page boutique. Mais maintenant on est dans une rue de Toulouse — briques roses, pavés, soleil doré. Il regarde l'écran et lève les yeux vers la rue, comme pour repérer la boutique.

```
[Attach: character sheet consommateur + image 3 comme ref écran]

Over-the-shoulder high-angle shot of a young French man — 25-28, 
short brown hair, 3-day stubble, white t-shirt under light beige 
cotton jacket — holding an iPhone showing the same Two-Step shop 
profile page (as in reference image: "Chez Simone" with product 
listings and green stock indicators, white UI with blue #4268FF 
accents).

He is standing on a charming Toulouse street with pink brick 
buildings, cobblestone pavement, and small boutique storefronts 
with warm window displays. Late afternoon golden sunlight creates 
long shadows and warm highlights on the facades.

Camera: over-the-shoulder from behind and slightly above, 50mm 
lens, f/2.0. Phone screen sharp, street in medium focus (readable 
but not distracting). Cinematic warm color grading. Photorealistic.
```

---

#### IMAGE 5 — Le moment de la remise en boutique

**Ce qu'on voit** : Intérieur de la même boutique. La commerçante tend un petit sac shopping en papier au consommateur. Les deux se regardent avec un sourire naturel. On reconnaît les mêmes vêtements, la même boutique, la même lumière. C'est le moment de satisfaction : le parcours digital s'est concrétisé en achat physique.

```
[Attach: character sheets commerçante + consommateur]

Inside the same warm French boutique (pink brick wall, clothing 
racks, pendant light, golden window light). The boutique owner 
— woman, 35-40, Mediterranean complexion, dark brown hair in low 
ponytail, white linen shirt under navy blue apron — hands a small 
cream-colored branded paper shopping bag across the wooden counter 
to the young customer — man, 25-28, short brown hair, stubble, 
white t-shirt under beige jacket.

Both are smiling genuinely — a moment of mutual satisfaction. 
The bag is the focal point, held between them at counter height.

Camera: medium shot from the side (90 degrees), both faces visible 
in 3/4 view, 50mm, f/2.8. Warm golden lighting. The moment feels 
authentic and human — not staged. Cinematic color grading, warm 
tones. Photorealistic.
```

---

### Phase 3 — Les transitions vidéo (Higgsfield / Kling)

**Outil principal recommandé : Higgsfield** (agrégateur multi-modèles).
Utiliser la feature **Start & End Frame** : upload image de départ + image d'arrivée + prompt de mouvement.

**Présets caméra Higgsfield pertinents** : Super Dolly In, Dolly Out, Crane Down, Arc Left/Right.

---

#### TRANSITION T1 : Image 1 → Image 2 (commerçante PC → commerçante téléphone)

**Durée** : 3 secondes
**Préset caméra** : Dolly Out (léger recul)

```
Start frame: [Image 1 — commerçante devant PC]
End frame: [Image 2 — commerçante avec téléphone]

The shopkeeper glances from her computer screen to her phone. 
A subtle blue light pulse (#4268FF) emanates from the computer 
screen, travels across the counter, and illuminates her phone 
screen — visualizing the POS sync signal. She lifts the phone 
and looks at it with satisfaction as product cards appear on 
the phone screen.

Camera: slow dolly out from medium to medium-wide. Warm golden 
interior lighting. 35mm cinematic look. Smooth, unhurried pace.
```

---

#### TRANSITION T2 : Image 2 → Image 3 (commerçante téléphone → écran plein cadre)

**Durée** : 2 secondes
**Préset caméra** : Super Dolly In

```
Start frame: [Image 2 — commerçante tenant téléphone]
End frame: [Image 3 — écran téléphone plein cadre]

Camera slowly pushes in toward the phone screen the shopkeeper 
is holding. The phone screen fills the entire frame progressively. 
The boutique interior background blurs away until only the phone 
screen with the Two-Step shop profile is visible.

Camera: smooth super dolly in, maintaining focus on the screen. 
The transition from 3D space to flat screen should feel seamless 
and organic. Warm to neutral color temperature shift.
```

---

#### TRANSITION T3 : Image 3 → Image 4 (écran plein cadre → consommateur rue)

**Durée** : 3 secondes
**Préset caméra** : Dolly Out + Crane Up

```
Start frame: [Image 3 — écran page boutique plein cadre]
End frame: [Image 4 — consommateur dans la rue avec le même écran]

THE KEY TRANSITION. Camera pulls back from the phone screen. 
As it zooms out, we discover that the phone is now held by 
different hands — a young man's hands in a beige jacket. The 
background shifts from the warm boutique interior blur to a 
sunlit Toulouse street with pink brick buildings. The same shop 
profile page is visible on the phone screen, but the context 
has completely changed — we've moved from merchant to consumer.

Camera: smooth continuous dolly out combined with a subtle crane 
up to reveal the street behind the person. The transition should 
feel like one unbroken shot. Golden hour exterior lighting.
```

> **C'est LA transition la plus importante.** La régénérer plusieurs fois si nécessaire.
> Le même écran, les mêmes données, mais deux personnes différentes, deux contextes différents.
> C'est ça le message de Two-Step : ce que le marchand met en ligne, le consommateur le voit à quelques rues.

---

#### TRANSITION T4 : Image 4 → Image 5 (consommateur rue → remise en boutique)

**Durée** : 4 secondes
**Préset caméra** : Tracking Shot + Dolly In

```
Start frame: [Image 4 — consommateur regardant son téléphone dans la rue]
End frame: [Image 5 — remise du sac en boutique]

The young man puts his phone in his pocket, looks up at the 
street ahead, and starts walking purposefully. He approaches 
a boutique entrance (warm light visible through the window). 
He pushes the door open and enters. Cut to inside: the shopkeeper 
smiles and hands him a shopping bag across the counter.

Camera: tracking shot following the man from behind, then 
transitions to interior shot as he enters. Warm golden light 
throughout. Cinematic pacing — not rushed. The walk should 
feel confident and determined.
```

---

#### TRANSITION T5 : Image 5 → Image 1 (remise → retour au dashboard = BOUCLE)

**Durée** : 3 secondes
**Préset caméra** : Pan + Dolly In

```
Start frame: [Image 5 — remise du sac]
End frame: [Image 1 — commerçante devant son PC]

The customer takes the bag and turns to leave. Camera pans 
from the handoff moment, following the customer toward the 
door briefly, then continues panning back toward the counter 
where the shopkeeper is already returning to her computer 
screen. She sits back at her desk and looks at the dashboard.
Camera slowly pushes in toward the screen.

The final frame should match the opening frame as closely as 
possible for a seamless loop. Same lighting, same angle, 
same warmth.
```

---

## RÉCAPITULATIF DE LA BOUCLE

```
Image 1: Commerçante devant son PC (dashboard)
   ↓ T1 (3s) — signal bleu, elle prend son téléphone
Image 2: Commerçante vérifie sur son téléphone
   ↓ T2 (2s) — zoom sur l'écran du téléphone
Image 3: Écran page boutique plein cadre ← PIVOT
   ↓ T3 (3s) — dézoom, c'est maintenant le consommateur qui tient le tel
Image 4: Consommateur dans la rue
   ↓ T4 (4s) — il marche, entre dans la boutique
Image 5: Remise du produit
   ↓ T5 (3s) — pan vers la commerçante qui retourne au PC
→ BOUCLE (Image 1)

Durée totale : ~15 secondes
```

---

## SPÉCIFICATIONS TECHNIQUES

### Vidéo finale

| Paramètre | Valeur |
|-----------|--------|
| Résolution | 1920x1080 (desktop), 1080x1920 (mobile) |
| Codec | H.264 (universel) + AV1 (30-50% plus léger) |
| Bitrate | 700-1200 kbps VBR |
| CRF H.264 | 24 |
| FPS | 24 fps (cinématique) |
| Durée | 15s (± 2s) |
| Taille cible | < 5 Mo |
| Audio | Supprimé (-an) |

### Commandes ffmpeg

```bash
# H.264 (compatibilité universelle)
ffmpeg -i hero-raw.mov -an -c:v libx264 -crf 24 -preset veryslow \
  -profile:v main -pix_fmt yuv420p -movflags +faststart \
  -vf "scale=1920:1080" hero.h264.mp4

# AV1 (navigateurs modernes, 30-50% plus petit)
ffmpeg -i hero-raw.mov -an -c:v libsvtav1 -qp 30 \
  -pix_fmt yuv420p -movflags +faststart \
  -vf "scale=1920:1080" hero.av1.mp4
```

### HTML d'intégration

```html
<video autoplay muted loop playsinline poster="/images/hero-poster.webp"
       class="absolute inset-0 h-full w-full object-cover">
  <source src="/video/hero.av1.mp4" type="video/mp4; codecs=av01.0.05M.08">
  <source src="/video/hero.h264.mp4" type="video/mp4">
</video>
```

### Accessibilité
- Respect de `prefers-reduced-motion` : pauser la vidéo
- Bouton pause visible en overlay
- Poster image en fallback

---

## COÛT ET OUTILS

| Outil | Usage | Coût |
|-------|-------|------|
| **Nano Banana Pro** | 2 character sheets + 5 images clés | API Gemini (quelques centimes) |
| **Higgsfield Pro** | 5 transitions Start & End Frame | $17.40/mois (600 credits) |
| **ffmpeg** | Assemblage + compression | Gratuit |

**Budget total estimé : < 20€**

---

## CHECKLIST PRÉ-PRODUCTION

- [ ] Character sheet commerçante générée (3 angles) et validée
- [ ] Character sheet consommateur généré (3 angles) et validé
- [ ] Les deux character sheets sont cohérents entre eux (même lumière studio)
- [ ] Joindre `dashboard-marchand.jpeg` + `jarrive.jpeg` + `carte.jpeg` comme refs DA

## CHECKLIST PRODUCTION

- [ ] Image 1 — commerçante + PC : cohérence avec character sheet
- [ ] Image 2 — commerçante + téléphone : même personne, même boutique
- [ ] Image 3 — écran plein cadre : UI fidèle au style Two-Step
- [ ] Image 4 — consommateur + rue : même écran que l'image 3
- [ ] Image 5 — remise sac : les DEUX personnages reconnaissables
- [ ] T1 (1→2) : signal bleu visible, mouvement naturel
- [ ] T2 (2→3) : zoom fluide sur l'écran
- [ ] **T3 (3→4) : transition pivot parfaite** (régénérer si nécessaire)
- [ ] T4 (4→5) : marche + entrée en boutique fluides
- [ ] T5 (5→1) : boucle seamless (même lumière, même angle)

## CHECKLIST POST-PRODUCTION

- [ ] Vidéo assemblée, 15s ± 2s
- [ ] Boucle invisible (pas de saut visible)
- [ ] Compressée < 5 Mo en H.264 + AV1
- [ ] Testée avec overlay gradient : titre hero lisible
- [ ] Testée sur mobile (autoplay fonctionne)
- [ ] Poster .webp extrait (frame la plus belle)
- [ ] `prefers-reduced-motion` respecté dans le code

---

## PRINCIPES NON-NÉGOCIABLES (issus de la recherche)

1. **Visage humain dans les 2 premières secondes** — le cerveau traite les visages plus vite que tout (+40-60% d'engagement)
2. **Le produit est le fil rouge** — on le voit 3 fois : sur le dashboard, sur le téléphone, dans le sac
3. **Zero texte sur la vidéo** — le headline HTML fait ce travail
4. **Bleu #4268FF uniquement sur les écrans** — contraste chaud (physique) vs froid (digital)
5. **Golden hour partout** — même lumière du début à la fin pour la boucle
6. **Pas de mouvement brusque** — le cerveau doit suivre en vision périphérique
7. **La transition T3 raconte l'histoire à elle seule** — même écran, deux personnes, deux mondes connectés
