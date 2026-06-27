# Veille R&D — Two-Step (l'agent qui suit l'actualité pour la croissance)

> Rôle : un agent R&D qui suit les dernières innovations et les rend **appropriables** pour
> Two-Step. Alimenté par l'étape **2bis** de `routine-prompt.md` (1×/jour max).
> Les pistes ACTIONNABLES remontent dans le backlog (`autonomy-priorities.md` §3).

## Protocole (résumé)
- **Cadence** : 1 entrée datée par jour MAX (l'agent saute si l'entrée du jour existe déjà).
- **Outil** : skill `last30days` (sinon `WebSearch`). Crédits limités (100 gratuits) → requêtes
  serrées, logger si épuisé.
- **Cibles de veille** (rotation, 1-2 par jour) :
  - Enrichissement produit : EAN/GTIN → image/nom/marque fiable, APIs catalogue, vision IA.
  - Google LFP / Local Inventory Ads / Merchant Center (changements, opportunités).
  - Intégrations POS FR (Clictill, Fastmag, Square, Zettle…) et export stock.
  - Concurrents / analogues (NearSt, Pointy, StoreLand…) — features, pricing, moves.
  - Outils dev/agents qui accélèrent la construction (avec recul, cf. obligation-récence).
- **Format d'une trouvaille** : `{source (lien), quoi (1 ligne), pourquoi pertinent Two-Step,
  action suggérée}`. **3-5 max**, filtrer le bruit. Pas d'action évidente → ne pas l'inscrire.
- **Honnêteté** : distinguer « innovation prouvée » de « hype ». Ne pas recommander d'adopter
  sans un test/POC chiffré. Une piste = un candidat, pas une décision.

---

## Journal (le plus récent en haut)

> _(vide — première entrée à venir au prochain run quotidien, ou via un run supervisé)_

<!-- Gabarit d'entrée :
## AAAA-MM-JJ — veille R&D
**Cibles** : <les 1-2 sujets requêtés>
1. **<titre>** — source: <lien> · quoi: <1 ligne> · pertinent: <pourquoi Two-Step> · action: <suggestion>
2. ...
**Crédits last30days** : <restant / épuisé>
**Remonté au backlog** : <item(s) ajouté(s) à §3, ou aucun>
-->
