# Audit ultracode des 9 maillons — 2026-07-08

> Workflow multi-agents : 1 agent d'audit par maillon (lecture code + SPEC + CODEMAPS + **tests unitaires réellement exécutés**), puis vérification adversariale de chaque finding contre le code réel (2 findings sur 47 réfutés). Les 3 lentilles d'intégration + la synthèse-agent ont été coupées par une limite de session ; synthèse reconstruite par l'orchestrateur à partir des 45 findings retenus (CONFIRMED/PLAUSIBLE). Détail brut : scratchpad `audit-synthese-brut.md`.

## Verdict franc

Le socle est **réellement bon** là où il a été durci et testé (M6 Google, M7 scale, les cœurs purs de M5/M8 : pagination keyset, streaming, gates fail-loud, helpers d'affichage honnêtes — des centaines de tests verts). **Mais la question qui obsède Thomas — attrape-t-on les faux positifs d'enrichissement ? — a une réponse dérangeante : la logique de détection existe, elle est bonne, mais elle FUIT à presque toutes les jonctions.**

La garde de concordance D7 (« le nom/identité que Google renvoie correspond-il au nom que le commerçant a tapé ? ») ne vit que dans **un** chemin (`runCascade`). Tous les chemins jumeaux la contournent. Résultat : le scénario exact « barbecue sur un casque » que Thomas veut interdire est **réellement atteignable en prod**, via le chemin facture.

## LE fil rouge : la garde anti-faux-positif est bonne mais posée à un seul endroit

C'est l'insight d'intégration central. La même faille se répète, maillon après maillon — la vérité commerçant (GTIN + nom) n'est PAS utilisée pour réfuter l'hypothèse d'enrichissement sur les chemins secondaires :

- **M3 CRITIQUE** — le chemin **facture / resolve-ean(direct_ean)** contourne totalement D7 : une ligne « chaussettes coton » avec EAN mal tapé résolu en « Coca-Cola Zero » est créée `visible=true`, `review_status=validated`, publiée au feed conso ET éligible Google. Aucune garde. (`invoices/[id]/validate/route.ts` insère sans passer par `runCascade`.)
- **M3 HAUT** — la photo Open Facts (OBF/OPF) est publiée **sans vérif vision** (`verifyPhotoWithAI` n'est appelé que sur les candidats Serper). Une image de dos d'emballage, ou d'un autre produit si l'EAN est recyclé, passe comme visuel produit.
- **M3 MOYEN** — la garde de cohérence marque est **défaite par elle-même** : après avoir annulé une marque incohérente, le code ré-extrait la marque… depuis le même nom résolu incohérent.
- **M3 MOYEN** — le downgrade D7 change bien `visible/review_status` mais **ne nettoie pas** `canonical_name/brand/photo` déjà écrits → le commerçant fait « 1-tap valider » et publie le mauvais nom/photo.
- **M2 HAUT** — des GTIN **dégénérés/restreints** (all-zeros, préfixe GS1 « 2 » réservé à l'usage interne magasin) sont acceptés comme identité FORTE et envoyés aux bases mondiales → un tout autre produit peut être résolu.
- **M2 MOYEN** — le **match par nom exact** applique le stock au mauvais produit homonyme, sur les chemins fichier ET facture, sans passer en revue (contrairement au fuzzy).
- **M6 MOYEN** — le gate GTIN du feed ne valide **que la longueur ≥8**, pas les chiffres ni le checksum, alors que le validateur existe déjà ailleurs dans le repo. Un `ean='SKU-ABCDEF'` saisi manuellement s'affiche « publiable » dans le preview (mensonge au marchand) et est poussé à Google.

**Conséquence stratégique :** ton moat (« savoir quand Google a tort ») est **à moitié construit**. Le détecteur central est bon ; il manque de l'appliquer partout et de brancher deux signaux gratuits que tu as déjà nommés toi-même — le **préfixe GS1 ↔ marque** et le **checksum** — plus l'**accord multi-sources**. Ce n'est pas un chantier de recherche, c'est du câblage de gardes existantes sur les chemins qui les contournent.

## Le second cluster : les faux « en stock »

- **M4 CRITIQUE** — le flux **file_push** (import fichier/email) contourne `update_stock_atomic` et la garde temporelle, avec `source_ts = heure du push`. Un export nocturne (02:00) uploadé à 09:00 **réécrit par-dessus une vente webhook de 08:00** → produit vendu affiché « 5 en stock ». Et il empoisonne la fraîcheur : le `source_ts` bidon devient la référence.
- **M1 HAUT** — les produits POS **sans suivi d'inventaire** sont forcés à `stock=1` → faux « disponible (1) » permanent, même après vente.
- **M5 HAUT** — le **feed Google n'applique pas** la dégradation par signalements clients : 4 clients signalent « pas en rayon », la fiche produit affiche « Épuisé » mais le feed Google émet toujours « in stock ».
- **M1 MOYEN** — le garde-fou de réconciliation `<50 %` laisse les articles vendus affichés « en stock » quand un export déclaré complet couvre moins de la moitié du catalogue.
- **M4/M5** — les **migrations 108/109/110/111 ne sont PAS appliquées en prod** (vérifié sur la base live : prod tourne sur 104/106). Donc les correctifs P0-5 (source_ts qui recule) et P0-6 (fausse notif « De retour en stock ! » sur un produit épuisé) sont **du code mort en prod** — les bugs restent exploitables.

## Le troisième cluster : troncature silencieuse résiduelle

M7 a réglé la classe principale (pagination keyset partout dans le pipeline), mais des plafonds en dur subsistent aux abords :
- **M8 MOYEN** — écran Review `.limit(500)` : 800 fiches enrichies → le marchand en valide 500, l'onglet tombe à 0, 300 fiches restent invisibles et jamais validables. Faux « tout est traité ».
- **M7 MOYEN** — `hideOrphanProducts` fait un `.in()` non batché : au-delà de ~1000 orphelins, échec en bloc → les références retirées gardent `visible=true` → catalogue fantôme poussé à Google run après run.
- **M7 BAS** — `sitemap.ts` plafonné `.limit(1000)` : au-delà, fiches jamais crawlées → perte SEO silencieuse.

## État par maillon

- **M1 Collecte** — solide et défensif sur les pertes DB, mais 2 faux positifs réels (fusion par nom dans le snapshot, stock=1 fabriqué) + réconciliation <50 % + NaN quantité silencieux.
- **M2 Identité** — noyau checksum/canonicalisation excellent et testé, mais classe de faux positif d'identité non gardée (GTIN dégénérés/restreints, collision EAN placeholder, match nom exact).
- **M3 Enrichissement** — gardes unitaires réelles et vertes, MAIS la garde D7 est contournée par le chemin facture (CRITIQUE) + photo OBF non vérifiée + 2 fuites marque/attributs. **Le maillon le plus critique du point de vue north-star.**
- **M4 Stockage** — invariants purs solides, mais l'atomicité/garde temporelle ne couvre PAS file_push (CRITIQUE) et les migrations correctrices ne sont pas déployées.
- **M5 Confiance** — cœur pur honnête et testé ; failles aux BORDS (feed ignore les signalements, M5 conso possiblement OFF en prod, source_ts file_push creux, fix delta non déployé, tripwire RLS aveugle <50 produits).
- **M6 Google LFP** — **très robuste** (parité réelle, keyset, budget honnête) ; seul trou : gate GTIN longueur-seule.
- **M7 Scale** — **le maillon le mieux instrumenté** ; 2 résidus (réconciliation POS non batchée, statut de cycle multi-run).
- **M8 UI Phase E** — 6 helpers purs corrects et testés, mais les écrans qui les CONSOMMENT ré-introduisent « blip = état rassurant » (Mon Stock squelettes infinis, review limit 500, redirect silencieux, auth.getUser non gardé, crash provider vide).
- **M9 Onboarding** — cœur testé solide (parité preview↔feed, token, import 2-temps), mais bords non testés : preview ignore `merchant.status` (fausse promesse « publié » au pilote), géoloc Mapbox à repli silencieux sur le centre de Toulouse, trace d'import qui avale son erreur.

## Feuille de route priorisée (par levier sur l'exactitude)

| # | Action | Maillon | Effort | Pourquoi c'est le levier |
|---|--------|---------|--------|--------------------------|
| 1 | **Appliquer les migrations 108/109/110/111** (fenêtre supervisée, protocole §4) | M4/M5 | M | Active des protections aujourd'hui MORTES en prod (P0-5/P0-6, source_ts). Le plus gros ROI immédiat, déjà préparé/testé. = DÉCISION #3. |
| 2 | **Router facture + direct-EAN par la MÊME garde D7** (insérer pending/visible=false, publier après concordance) + **soumettre la photo OBF à la vérif vision** | M3 | M | Ferme le faux positif « barbecue sur casque » à sa source principale. Le cœur du moat. |
| 3 | **file_push via update_stock_atomic + vrai source_ts** (horodatage de génération de l'export, pas nowIso) | M4 | M-L | Tue le « export périmé écrase une vente fraîche → faux en stock ». |
| 4 | **Un validateur GTIN unique partout** : identité (rejeter préfixes restreints/dégénérés en identité forte), gate feed (checksum, pas longueur), POST/PATCH products | M2/M6 | S-M | Branche 2 des 3 détecteurs de faux positif que tu as nommés (préfixe GS1, checksum). Code déjà existant, juste à câbler. |
| 5 | **Produits POS untracked → état « présence inconnue » explicite**, pas stock=1 | M1 | M | Tue le faux « disponible » permanent. |
| 6 | **Feed Google applique la dégradation par signalements** (M5 #6 sur la surface north-star) | M5 | S-M | Aligne le feed sur la confiance conso. |
| 7 | **Fixes honnêteté UI pilote** : Mon Stock (garde merchant-load + Réessayer), Review (.limit(500) → count exact), auth.getUser gardé, provider vide | M8 | S ×4 | Écrans que verra le marchand pilote ; faible effort, fort impact confiance. |
| 8 | **feed-preview respecte merchant.status** (ne pas dire « publié » quand Google reçoit 410) | M9 | S | Ferme la fausse promesse pendant la fenêtre exacte d'onboarding pilote. |
| 9 | **Batcher hideOrphanProducts + paginer sitemap** | M7 | S | Ferme les 2 troncatures résiduelles. |
| 10 | **Accord multi-sources + downgrade D7 qui nettoie les attributs** | M3 | M | Le 3e détecteur de faux positif + fin de la validation 1-tap du mauvais nom. |

## Ce qui est déjà bien (crédit mérité, zéro complaisance)

Le pipeline n'est pas fragile — il est **inégalement durci**. M6 et M7 sont d'un niveau solide. Les cœurs purs (confidence, helpers d'affichage, cascade unitaire) sont honnêtes et testés. La discipline « ne rien perdre silencieusement » est réellement appliquée sur la plupart des écritures DB. Le problème n'est pas l'absence de gardes — c'est que **les bonnes gardes ne sont pas appliquées sur tous les chemins jumeaux**, et que **plusieurs correctifs déjà écrits dorment, non déployés, derrière des migrations non appliquées.** C'est une bonne nouvelle : la majeure partie du travail est du câblage et un déploiement supervisé, pas de la R&D.
