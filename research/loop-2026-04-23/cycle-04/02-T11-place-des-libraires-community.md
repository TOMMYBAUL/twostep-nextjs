# T11 — Place des Libraires / réseau librairies indépendantes : modèle community

*1 search. Confidence 6/10 (info publique limitée, pas de doc "community playbook").*

## Findings

### Écosystème librairies indépendantes FR

**3 plateformes principales** :
1. **placedeslibraires.fr** — portail de réservation livres papier + numériques
2. **lalibrairie.com** — ~2500 librairies fédérées
3. **librairiesindependantes.com** — géolocalisation 1200 librairies, agrégation stocks
4. **leslibraires.fr** — ~300 librairies avec e-commerce duplicable

**Infrastructure technique** :
- **Dilicom** = backbone B2B : centralise stocks éditeurs + permet aux libraires de consulter dispos temps réel
- Les plateformes agrègent ces stocks pour exposer aux consos

### Le modèle structurel

1. **Dilicom au centre** : protocole standard FR de la chaîne du livre (1988) — tous les éditeurs y poussent leurs stocks
2. **Librairies membres** payent un abo annuel modeste (150€/an mentionné dans brain Two-Step, à vérifier) pour accéder à Dilicom + outils
3. **Syndicat de la librairie française** (SLF) gouverne les conditions d'adhésion
4. **Plateformes** piochent dans Dilicom + exposent aux consos avec UX variée

### Leçons pour Two-Step

**Ce que Two-Step copie déjà** :
- ✅ Concept "catalogue mutualisé indépendants"
- ✅ Abo low-cost (19€/mois ≈ 228€/an) cohérent avec le 150€/an référence
- ✅ Vision géolocalisation + stock temps réel

**Ce qui diffère** :
- ❌ Pas d'équivalent "Dilicom" pour Two-Step (pas de backbone FR cross-catégories — c'est ce que Two-Step construit avec son cache `ean_lookups`)
- ❌ Pas de Syndicat qui gouverne (avantage : liberté ; inconvénient : pas de canal pré-existant pour toucher les marchands)
- ❌ Catégories Two-Step (mode, skincare, tech, jouets) = 100x plus fragmentées que livre

### Question community

Pas trouvé direct data sur comment les libraires communiquent entre eux (WhatsApp ? Slack ? forums SLF ?). Hypothèse plausible :
- **SLF** organise des AG / newsletters / formations
- **Dilicom** a des webinaires
- Pas de channel "peer-to-peer" dynamique équivalent à WhatsApp community

**Implication** : Two-Step peut **innover** en créant un canal peer-to-peer que les libraires n'ont pas. La community WhatsApp (S2 cycle 02) devient un différenciateur nouveau pour les commerçants brandés.

## Recommandations Two-Step

1. **S'inspirer** : Dilicom = modèle backbone, `ean_lookups` = équivalent naissant pour Two-Step
2. **Ne PAS copier** : pas besoin de syndicat ni de structure lourde en Phase 1
3. **Innover sur community** : WhatsApp peer-to-peer est un vide que Place des Libraires ne remplit pas
4. **Partenariat possible Phase 3** : intégration Two-Step ↔ librairies via API si un marchand Two-Step est aussi libraire (cas rare)
5. **Veille** : s'abonner newsletter SLF pour comprendre évolution du modèle chaîne du livre (signal macro retail physique FR)

## Nouveau questionnement émergé

- Un équivalent "Syndicat indépendants Toulouse" existe-t-il pour les boutiques non-livre ? (ACAAB ? ACRR ? brain les mentionne)
- Two-Step peut-il co-signer avec une association commerçants pour crédibilité instantanée ?
- Thomas peut-il proposer une "AG Two-Step quartier" = équivalent AG libraires pour son segment ?

## Confidence : 6/10

Info externe solide mais peu profonde sur la "community" réelle entre libraires. La vraie valeur serait d'interviewer un libraire indépendant FR pour comprendre leur quotidien — action Phase 2.

## Sources

- [Place des Libraires](https://www.placedeslibraires.fr/)
- [lalibrairie.com 2500 librairies](https://www.lalibrairie.com/)
- [Librairies indépendantes](https://www.librairiesindependantes.com/)
- [Dilicom](https://www.dilicom.net/)
- [La digitalisation de la librairie indépendante — Tactill](https://www.tactill.com/blog/la-digitalisation-de-la-librairie-independante/)
