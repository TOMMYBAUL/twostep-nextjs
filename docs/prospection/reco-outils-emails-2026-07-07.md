# Trouver les emails des commerçants Toulouse — reco outils (2026-07-07)

Recherche faite le 2026-07-07 (WebSearch + skill last30days sur Reddit/HN/GitHub, 30 derniers jours).

## Ce qu'on a déjà (à ne pas re-scraper)

- **17 emails réels** (base `prospects-avec-email-2026-07-07.csv`) — utilisables tout de suite.
- **181 boutiques identifiées** (nom/adresse/quartier/catégorie, dont 30 avec site web → email récupérable manuellement en 5 min chacune via la page Contact).
- **2504 commerces SIRENE** (nom + adresse + code NAF, **sans email ni téléphone**) — c'est le carburant à enrichir.

## Le bon outil selon la source

**Verdict : pour des commerces locaux, Google Maps > LinkedIn.** Un commerçant indépendant de quartier n'a souvent pas de profil LinkedIn actif, mais il a quasi toujours une fiche Google Maps avec site web → email. LinkedIn vise les entreprises « corporate », pas la bijouterie du coin.

### 1. Google Maps → email (LA voie principale pour toi)

| Outil | Prix indicatif | Pour qui | Note |
|---|---|---|---|
| **Outscraper** (recommandé) | ~3 $/1000 fiches, ~14 $/1000 **avec emails** ; 500 fiches gratuites | Le plus simple, pay-as-you-go, pas d'abo | Scanne le site de chaque commerce pour trouver l'email. Idéal pour toi : « boutiques mode Toulouse » → liste emails en 1 run. |
| **Apify** (Google Maps Scraper) | ~1,5-4 $/1000 base, 5,5-11 $/1000 avec emails vérifiés | Si tu veux du contrôle fin + vérif email valide/invalide/jetable | Plus technique, mais emails déjà nettoyés. |
| **Scrap.io** | Abo | Alternative FR à PhantomBuster, ciblage par zone | Bon sur la France. |

> **PhantomBuster** : ne fait **PAS** l'extraction d'email seul (il faut chaîner un 2e outil). ~69 $/mois. Moins adapté à ton besoin direct que Outscraper.

### 2. LinkedIn (secondaire, à réserver plus tard)

- Outils cités : **Evaboot**, **PhantomBuster**, **Apollo.io**, **Lusha** (tu as d'ailleurs un connecteur Lusha dispo dans tes MCP claude.ai).
- ⚠️ Le scraping LinkedIn viole leurs CGU (risque de ban de ton compte) et, côté signal terrain, la communauté est cash : *« LinkedIn is AI spam. 95% des posts sont de l'IA »* (u/Sir_Slimmothy, r/LeadGeneration). Pour des commerces de quartier, faible rendement.
- **Recommandation** : ignore LinkedIn pour la prospection boutiques. Garde Lusha/Apollo pour plus tard si tu vises des chaînes ou des groupements.

## Le workflow que je te recommande (concret)

1. **Aujourd'hui, gratuit** : envoie l'email de tri (`email-blast-decouverte-2026-07-07.md`) aux **17 emails** qu'on a déjà + appelle les boutiques dont on a le **téléphone** (45+). Zéro coût, ça peut déjà décrocher un pilote pendant que le reste s'enrichit.
2. **Cette semaine, ~15-30 $** : un run **Outscraper** sur Toulouse par catégorie (mode, chaussures, bijou, sport, déco) → ça transforme les 2504 SIRENE + au-delà en une base de plusieurs centaines d'emails vérifiés. Exporte en CSV, je le fusionne dans la base maître.
3. **Envoi en masse** : passe par un outil de cold-email avec warmup (**Instantly.ai** ou **Lemlist**, ~30-50 $/mois) depuis un **domaine secondaire** (ex. `go-twostep.fr`) — JAMAIS depuis contact@twostep.fr en direct (tu cramerais le domaine). Ils gèrent quotas, relances, désinscription RGPD.

## Ce dont j'ai besoin de toi pour aller plus loin

- **Un OK sur ~15-30 $ d'Outscraper** (ou tu me donnes une clé API et je peux préparer le run / le lancer si tu veux). C'est de la dépense → décision Thomas, je ne la fais pas seul.
- **Décider du domaine d'envoi** : acheter un `go-twostep.fr` (~10 €/an) pour protéger le principal, ou envoyer petit (30/jour) depuis l'existant.

Voir aussi : `DECISIONS-EN-ATTENTE.md` (j'y ajoute ces deux points).
