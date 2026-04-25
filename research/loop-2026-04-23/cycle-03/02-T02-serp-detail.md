# T2 — Structure SERP Google FR détaillée (skip justifié)

## Tentative

WebFetch sur `https://www.google.com/search?q=Nike+Air+Force+1+Toulouse&hl=fr&gl=fr` → **redirect forcé vers consent.google.com** (GDPR FR). Je ne peux pas accepter le consent depuis WebFetch = impossible d'accéder au SERP réel.

## Ce qui reste acquis

- Du cycle 02 S7 : WebSearch API retourne les marchands cités (Panorama, The Last Step, JD Sports, Size?, SNIPES, pagesmode.com)
- De Q19 cycle 01 : benchmarks généraux (14% mobile searches = product grids, 46% searches local intent, 1.5B near-me/mois)

## Ce qui manque

Test réel Chrome FR mobile. Ne peut être fait que par Thomas (lundi matin, 5 min).

## Action Thomas

1. Ouvrir Chrome privé mobile
2. Query : `Nike Air Force 1 Toulouse`, `sneakers Toulouse`, `acheter pull Toulouse`
3. Screenshot + noter :
   - Y a-t-il un bloc "In Stores Nearby" en haut ?
   - Quels marchands y apparaissent ?
   - Sole Store seed Two-Step apparaît-il ? (test FLL auto)
   - La map Maps est-elle dominante ?
4. Rapporter dans le brain → `docs/research/2026-04-23-test-serp-live.md`

## Confidence : N/A (bloquer technique, pas faiblesse méthodo)
