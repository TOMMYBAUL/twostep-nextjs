# Two-Step — Project Brief

> Ce document est la reference unique pour tous les agents automatises.
> Derniere mise a jour : 2026-06-14 (positionnement Google-LFP-first — voir section dediee)

## Vision

Two-Step rend le **stock des boutiques independantes** visible aux consommateurs du quartier. Un client cherche un produit → il voit quelle boutique l'a en stock pres de chez lui → il va l'acheter en magasin.

**Two-Step N'EST PAS** : une solution de paiement, de livraison, de e-commerce, de click-and-collect, ou de marketplace. C'est un moteur de decouverte de stock local.

## Positionnement & sequence produit (decide 2026-06-14)

> Clarification strategique majeure issue du brainstorm "qu'apporte-t-on de plus
> qu'un site avec stock ?". A relire avant toute decision de direction.

**Le constat brutal** : la valeur "app de decouverte" (carte/feed Two-Step) est
NULLE tant qu'il n'y a pas d'audience consommateur (probleme oeuf/poule des
marketplaces). Construire cette audience = des annees + un budget qu'on n'a pas.
Donc l'app ne peut PAS etre l'argument de vente initial.

**Le produit qui cree de la valeur des le 1er marchand = le canal Google LFP.**
Two-Step est d'abord un **"feed Google Local Inventory as a service"** : "ton stock
physique apparait sur Google 'en stock pres de chez moi', en temps reel, sans que
tu touches a Google Merchant Center". Cette valeur est **independante de l'audience
Two-Step** — elle branche le marchand sur l'audience DEJA massive de Google. C'est
le job-to-be-done reel, et la seule traction possible sans audience prealable.
La vraie alternative du marchand n'est pas "un site" mais "faire son Google
Shopping seul" — ce qu'il ne sait pas faire (Merchant Center + validation LFP +
store codes + GBP) et ne peut pas maintenir en temps reel (feed frais = caisse
branchee). C'est la qu'est notre utilite.

**L'app (carte, feed, decouverte proximite, boutiques sans site) = la COUCHE
D'HABILLAGE differenciante**, dont la valeur CROIT avec la densite de marchands.
Elle se vend "en plus", pas "a la place". Elle devient un vrai atout quand une
zone atteint une masse critique — pas au demarrage.

**Modele = celui de NearSt ("feed LFP as a service"), MAIS pas leur acquisition.**
NearSt depend de partenariats editeurs (l'editeur pousse pour tous ses marchands) —
qu'on n'a pas et qui prennent des annees. Notre acquisition :
1. **Caisses cloud (Shopify/Square/Zettle/Lightspeed)** : OAuth 2 clics → automatique
   a vie. DEJA construit. On EST l'integration (via API publiques). **Cible n°1.**
2. **Caisses fermees FR** : drag-drop manuel (construit) ou email (a construire) —
   pas d'automatique cle-en-main sans technicien. Avantage vs NearSt : on ne REFUSE
   pas ces marchands (NearSt si).
3. **Partenariats editeurs FR** (Clictill/Fastmag…) : plus tard, avec la traction.

**Sequence d'execution** : (1) canal Google LFP irreprochable + onboarding caisses
cloud ; (2) habillage app + boutiques sans site ; (3) partenariats editeurs.
**Prerequis n°1 = faire ABOUTIR la candidature Google LFP** (cf. section dediee).

## Fondateur

- **Thomas Bauland** — kinesitherapeute de formation, solo founder
- Genre : **masculin** (dans tous les emails : "je serais ravi", jamais "ravie")
- Localisation : Toulouse, France
- Entreprise : immatriculee RCS Toulouse 102 932 290 (avril 2026)

## Marche cible

### Cote marchand (B2B)
- Boutiques **independantes** de Toulouse vendant des produits de **marque**
- Segments : mode, sneakers, bijouterie, cosmetique, optique, deco, sport, maroquinerie
- **PAS** : restaurants, artisans, services, chaines nationales (>5 etablissements)
- Marche adressable Toulouse : **1 561 commercants independants** (source : annuaire-entreprises.data.gouv.fr)
- 208 prospects prioritaires centre-ville avec dirigeant identifie

### Cote consommateur (B2C)
- Habitants de Toulouse qui cherchent des produits specifiques (sneakers, robes, bijoux...)
- Alternative aux achats sur internet — tu trouves, tu y vas, tu l'as aujourd'hui
- **JAMAIS citer Amazon ou Zalando** — dire "achats sur internet" ou "boutiques en ligne"

## Pricing

| Offre | Prix | Conditions |
|---|---|---|
| Pionniers (places 1-30) | **19 EUR/mois** | Prix verrouille a vie |
| Early (places 31-50) | 29 EUR/mois | Prix verrouille a vie |
| Standard (51+) | 39 EUR/mois | Prix normal |

- **1 mois gratuit** pour tous les nouveaux marchands
- Pas d'engagement, resiliable a tout moment
- Stripe pour le paiement

## Ce qui est construit

### App consumer (twostep.fr)
- Decouverte de produits par geolocalisation (carte + feed)
- Filtres : categorie, taille, marque, couleur, prix, genre
- Profil boutique avec catalogue complet
- Favoris produits + suivi de boutiques (follows)
- Preferences tailles (vetements + pointure)

### Dashboard marchand (twostep.fr/dashboard)
- Onboarding en <2 min
- Import catalogue CSV/Excel (workflow complet)
- Import factures fournisseur (PDF, email)
- Synchronisation POS : Square, Shopify, Lightspeed, Zettle
- Gestion stock manuelle
- Preview profil boutique
- Tips coach (amelioration profil)
- Statistiques

### Pipeline d'enrichissement (automatique)
1. **Reverse EAN search** : nom produit → code EAN via 4 bases (EAN-Search, UPCitemdb, Open Beauty Facts, Open Products Facts)
2. **EAN enrichment** : EAN → nom canonique + photo
3. **Serper image search** : photo e-commerce via Google Images + verification IA (Claude Haiku)
4. **rembg** : suppression fond, recadrage, 800x800 WebP
5. **Categorisation IA** : Groq/Gemini assigne categorie + sous-categorie + tags (marque, couleur, genre)

### Infrastructure
- **Frontend** : Next.js, Vercel, Tailwind CSS v4, React 19
- **Backend** : Supabase (PostgreSQL + Auth + Storage + RPC)
- **Images** : Cloudflare R2 + rembg sur VPS Hetzner
- **DNS/Email** : Cloudflare + Infomaniak (bauland@twostep.fr, contact@twostep.fr)
- **Paiement** : Stripe
- **Cout mensuel** : ~9 EUR (Hetzner 6 EUR, Infomaniak 1 EUR, domaine 1 EUR)

## Charte graphique

- **Mode** : light mode uniquement
- **Couleur principale** : bleu #4268FF
- **Typographies** : Archivo Black (titres), Barlow (sous-titres), Inter (corps)
- **Arrondis** : 8-12px
- **Style** : epure, professionnel, accessible

## Strategie de prospection

### Pipeline agents (11 agents automatises)
- **L'Eclaireur** : recherche emails des prospects via web search (base 208 centre-ville)
- **L'Auditeur** : redige emails personnalises avec prenom du dirigeant
- **Le Relanceur** (x3) : gere les follow-ups J+3/J+7/J+14
- **Le Veilleur** : detecte nouvelles boutiques / signaux
- **Le Stratege** : rapport hebdo + mini-cours marketing
- **Le Redacteur SEO** : articles blog SEO local
- **Le Community Manager** : posts Instagram + LinkedIn
- **L'Ambassadeur** : outreach associations de commercants

### Donnees disponibles
- `docs/prospection/toulouse-merchants-full.json` : 1 561 commercants avec SIREN, adresse, dirigeant, segment
- `docs/prospection/top-prospects-centre.json` : 208 prospects centre-ville filtres
- `docs/prospection/leads-tracker.md` : CRM simplifie avec statuts
- `docs/prospection/kit-prospection/` : templates email, scripts telephone, guide objections

### Methode cold email
- **ACA** (Acknowledge, Compliment, Ask) — methode Hormozi
- Tutoiement obligatoire (sauf associations : vouvoiement)
- Max 150 mots, prenom du dirigeant dans l'accroche
- Signature : Thomas Bauland — Two-Step / contact@twostep.fr / twostep.fr
- Lien UTM : twostep.fr/marchands?utm_source=email&utm_medium=cold&utm_campaign=audit
- Footer : "PS Reponds STOP si tu ne souhaites plus recevoir de messages."

### Terrain
- Thomas fait du porte-a-porte dans Toulouse centre
- Flyers A5 laisses aux marchands interesses
- Quartiers prioritaires : Capitole, Carmes, Saint-Rome, Saint-Etienne

## Google LFP (Local Feeds Partnership)

- Candidature en cours — transferee a l'equipe onboarding Google (avril 2026)
- Objectif : les produits des marchands Two-Step apparaissent sur Google Shopping
- Ticket support : 5-9519000040422
- **NE PAS promettre Google Shopping aux marchands** — pas encore actif

## Concurrence

| Concurrent | Statut | Difference Two-Step |
|---|---|---|
| Cocote | 4800 inscrits, 20% actifs, pas d'integration POS | Two-Step = integration POS + enrichissement IA |
| NearSt (UK) | EAN → Google Shopping | Two-Step = pas besoin d'EAN, enrichissement automatique |
| Pointy (Google) | Arrete | — |
| Epicery | -5.6M EUR pertes | Two-Step = pas de livraison, pas de commission |
| Place des Libraires | 800 librairies, 150 EUR/an | Modele de reference, mais livres uniquement |

## Regles absolues pour les agents

1. JAMAIS inventer une description de Two-Step differente de ce document
2. JAMAIS citer Amazon, Zalando, ou toute marketplace
3. JAMAIS utiliser le feminin pour Thomas ("ravie" → "ravi")
4. JAMAIS promettre Google Shopping
5. JAMAIS envoyer un email sans le prenom du dirigeant + nom de la boutique
6. JAMAIS contacter un restaurant, artisan, ou service
7. Toujours tutoyer les marchands (sauf associations : vouvoyer)
8. Toujours inclure le lien UTM dans les emails
9. Toujours inclure le footer STOP
10. Qualite > quantite — mieux vaut 3 leads avec email que 10 sans
