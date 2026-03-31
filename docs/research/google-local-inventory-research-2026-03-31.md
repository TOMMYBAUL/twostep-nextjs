# Recherche : Google Local Inventory pour Two-Step

**Date** : 31 mars 2026
**Objectif** : Comprendre comment Two-Step peut pousser l'inventaire de boutiques locales sur Google Shopping / Google Maps au nom de marchands independants.

---

## Table des matieres

1. [Google Local Feeds Partnership Program](#1-google-local-feeds-partnership-program)
2. [Google Merchant Center Multi-Client Account (MCA)](#2-google-merchant-center-multi-client-account-mca)
3. [Google Content API / Merchant API](#3-google-content-api--merchant-api)
4. [Local Inventory Ads (LIA) sans etre partenaire](#4-local-inventory-ads-lia-sans-etre-partenaire)
5. [Google Business Profile + Pointy / Local Inventory App](#5-google-business-profile--pointy--local-inventory-app)
6. [Exemples de partenaires LFP](#6-exemples-de-partenaires-lfp)
7. [Specificites France](#7-specificites-france)
8. [Plan d'action pour Two-Step](#8-plan-daction-pour-two-step)

---

## 1. Google Local Feeds Partnership Program

### Qu'est-ce que c'est ?

Le **Local Feeds Partnership (LFP)** est un programme Google qui permet a des **fournisseurs de donnees POS/inventaire** de soumettre des flux d'inventaire local a Google **au nom de detaillants**. Les marchands n'ont pas besoin de creer eux-memes leurs flux produits ou inventaire.

**C'est exactement le role que Two-Step veut jouer.**

### Comment candidater ?

1. Remplir le formulaire **"Point-of-Sale Data Provider Feedback"** (formulaire Google accessible depuis la doc Merchant Center, lien sur la page https://support.google.com/merchants/answer/7676652)
2. Fournir les details de son entreprise et de sa solution technique
3. Google evalue la candidature et active l'acces aux endpoints LFP

### Prerequis

- Avoir un **compte Google Merchant Center**
- Avoir la capacite technique de soumettre des donnees d'inventaire via API ou fichiers
- Disposer de marchands avec des magasins physiques prets a etre connectes
- **Aucun nombre minimum de marchands n'est documente publiquement** pour candidater
- Cependant, pour obtenir le statut **"Trusted"** (statut de confiance), il faut passer **5 verifications d'inventaire en magasin pour 5 marchands differents**

### Processus d'approbation

1. Soumission du formulaire "Point-of-Sale Data Provider Feedback"
2. Contact avec l'equipe Google (idealement via un "Google Business Partner" contact)
3. Creation du compte MCA + sous-compte LFP provider
4. **Google active manuellement** les endpoints LFP sur le sous-compte (impossible en self-service)
5. Debut de la soumission de donnees
6. Verification d'inventaire en magasin (5 marchands) pour obtenir le statut "Trusted"

### Duree estimee

- **Sans partenaire existant** : le processus peut prendre **3-6 mois** pour un nouveau fournisseur
- **Avec le statut Trusted** (une fois obtenu) : onboarding d'un nouveau marchand en **1-2 semaines**

### Sources cles

- https://support.google.com/merchants/answer/7676652 (programme LFP)
- https://developers.google.com/merchant/api/guides/local-feeds-partnership/overview (API LFP)
- https://support.google.com/merchants/answer/7676580 (onboarding data provider)
- https://developers.google.com/merchant/storebuilder/local/sections/overview_and_requirements/overview (Storebuilder Blueprint)

---

## 2. Google Merchant Center Multi-Client Account (MCA)

### Qu'est-ce que c'est ?

Un **Multi-Client Account (MCA)** (aussi appele "Advanced Account") est un conteneur de comptes Merchant Center qui permet de gerer **plusieurs sous-comptes marchands** sous un seul compte parent. C'est l'architecture requise pour un fournisseur LFP.

### Qui peut creer un MCA ?

**Oui, une startup peut creer un MCA.** Il n'y a pas de restriction documentee sur la taille de l'entreprise. Les cas d'usage officiels :

- **Marketplaces** : plateformes ou plusieurs marchands vendent
- **Merchants multi-marques** : entreprises avec plusieurs marques
- **Retailers internationaux** : vente multi-pays
- **Channel partners** : partenaires qui permettent a des marchands de lister sur differents canaux

**Two-Step correspond au profil "Channel partner" ou "Marketplace".**

### Comment creer un MCA ?

1. **Creer un nouveau compte Google** dedie a l'entreprise (ne pas utiliser un compte perso)
2. **Creer un compte Merchant Center** avec ce compte Google
3. **NE PAS verifier/revendiquer de site web** sur ce compte (il sera converti en MCA)
4. **Aller dans Settings > Account setup > Advanced account setup**
5. **Cliquer "Request Conversion"**
6. Google convertit le compte en MCA

### Conditions pour la conversion

- Etre admin du compte
- Le compte ne doit pas deja etre un MCA ou un sous-compte d'un MCA
- Aucune violation de politique au niveau du compte
- Pas de multiples sites web avec contenu similaire

### Limites

- **50 sous-comptes** par defaut au depart
- Demande d'augmentation possible via formulaire de quota ou contact Google
- Quotas partages entre sous-comptes pour offres et flux

### Ensuite : Creer le sous-compte LFP Provider

Apres la conversion en MCA :
1. Creer un **nouveau sous-compte** dedie a la soumission de donnees LFP
2. **Contacter Google Support** pour faire activer les endpoints LFP sur ce sous-compte
3. Ce sous-compte sera le "LFP Provider Account" utilise pour toutes les soumissions

### Sources cles

- https://support.google.com/merchants/answer/14089347 (request advanced account)
- https://support.google.com/merchants/answer/15623997 (MCA documentation)
- https://developers.google.com/google-ads/shopping/full-automation/articles/t1 (create MCA)
- https://developers.google.com/merchant/storebuilder/local/sections/account_structure/2_0_mca_lfp_accounts_setup_and_management

---

## 3. Google Content API / Merchant API

### ALERTE IMPORTANTE : Migration obligatoire

Le **Content API for Shopping v2.1** sera **arrete le 18 aout 2026**. Toute nouvelle integration DOIT utiliser le **Merchant API** (nouvelle version).

- **Deadline beta** : 28 fevrier 2026 (passee)
- **Deadline finale** : 18 aout 2026
- Migration recommandee 3-5 mois avant la deadline

**Two-Step doit implementer directement avec le Merchant API, pas le Content API.**

### Merchant API - Endpoints LFP

Les endpoints specifiques au programme Local Feeds Partnership :

#### a) Soumettre de l'inventaire
```
POST https://merchantapi.googleapis.com/lfp/v1/{PARENT}/lfpInventories:insert
```
Parametres cles : `storeCode`, `offerId`, `gtin`, `price`, `availability`, `collectionTime`, `pickupMethod`, `pickupSla`

#### b) Soumettre des ventes
```
POST https://merchantapi.googleapis.com/lfp/v1/{PARENT}/lfpSales:insert
```
Parametres cles : `quantity`, `saleTime`, `price`, `gtin`, `offerId`, `storeCode`

#### c) Enregistrer un magasin
```
POST https://merchantapi.googleapis.com/lfp/v1/{PARENT}/lfpStores:insert
```
Parametres cles : `storeCode`, `storeAddress`, `targetAccount`
Retourne un `matchingState` pour valider le matching d'adresse.

#### d) Verifier le statut d'onboarding d'un marchand
```
GET https://merchantapi.googleapis.com/lfp/v1/accounts/{ACCOUNT_ID}/lfpMerchantStates/{TARGET_MERCHANT_ID}
```

#### e) Envoyer une notification d'onboarding
```
POST https://merchantapi.googleapis.com/lfp/v1/accounts/{ACCOUNT_ID}/lfpNotifications:send
```
Type supporte : `ONBOARDING_UI` uniquement.

### Merchant API - Inventaire local (hors LFP)

Pour les marchands individuels (pas via un provider LFP), le Merchant Inventories API :
```
POST https://merchantapi.googleapis.com/.../localInventory
```
Permet d'ajouter des infos en magasin : `storeCode`, `price`, `availability`, `pickupMethod`.

### Authentification

- **OAuth 2.0** : creer des credentials OAuth dans Google Cloud Console, telecharger `client-secrets.json`
- **Service Account** : creer un service account dans Google Cloud, telecharger la cle privee JSON, ajouter l'email du service account comme utilisateur admin dans Merchant Center
- **Developer Registration** : lier le compte Merchant Center au projet Google Cloud (one-time)

### Sources cles

- https://developers.google.com/merchant/api/guides/local-feeds-partnership/overview
- https://developers.google.com/shopping-content/reference/rest/v2.1/localinventory (v2.1, en sunset)
- https://developers.google.com/merchant/api/guides/quickstart/authentication
- https://developers.google.com/merchant/api/guides/inventories/add-local-inventory

---

## 4. Local Inventory Ads (LIA) sans etre partenaire

### Option A : Chaque marchand gere son propre compte

**Oui, un marchand individuel peut activer LIA seul**, sans passer par un partenaire LFP. Le processus :

1. Creer un compte Merchant Center
2. Creer un Google Business Profile et le lier
3. Verifier son entreprise
4. Activer l'add-on "Local Inventory Ads" ou "Free Local Listings"
5. Soumettre un flux produit principal + un flux inventaire local
6. Passer la verification d'inventaire Google

**Probleme** : 74% des retailers echouent a se configurer seuls (source NearSt). Le processus est complexe et la verification prend du temps.

### Option B : Un tiers soumet des feeds sans etre partenaire officiel

**Non, ce n'est pas vraiment possible.** Pour soumettre des donnees d'inventaire au nom d'un marchand, il faut :

- Soit etre un **LFP Provider approuve** par Google
- Soit avoir un acces admin au compte Merchant Center du marchand (le marchand vous ajoute comme utilisateur)

Il n'existe pas de mecanisme "tiers non-partenaire" pour pousser de l'inventaire. **Two-Step DOIT devenir LFP Provider ou gerer les comptes MC des marchands.**

### Option C : Single Location Store (simplifiee)

Pour les marchands avec **un seul magasin** et un site web existant, Google propose une option simplifiee :
- Les produits du site web apparaissent automatiquement comme "free local listings"
- Pas besoin de flux inventaire local separe
- Le systeme suppose que tous les produits en ligne sont disponibles en magasin

**Limitation** : ne marche que pour les commerces avec un site e-commerce existant et un seul point de vente.

### Sources cles

- https://support.google.com/merchants/answer/14615117 (LIA overview)
- https://support.google.com/merchants/answer/15609877 (single location store)
- https://www.datafeedwatch.com/blog/google-local-inventory-ads-setup

---

## 5. Google Business Profile + Pointy / Local Inventory App

### L'historique Pointy

- **Pointy** etait une startup irlandaise rachetee par Google en 2020
- Le boitier Pointy scannait les codes-barres lors des ventes POS pour mettre a jour l'inventaire sur Google
- Pointy a ete **renomme "Local Inventory App"** et integre directement dans Google
- Le boitier Pointy est devenu le "Product Reader"

### Comment ca marche aujourd'hui

Le **Local Inventory App** (ex-Pointy) fonctionne avec de nombreux POS :
- Clover
- Square
- Lightspeed
- Et ~130+ systemes de gestion de stock

Les produits scannes apparaissent automatiquement sur :
- Google Maps
- Google Shopping
- Google Search (Local Listings)
- Google Images

### Disponibilite en France

**Partiellement disponible.** Le Local Inventory App fonctionne avec certains POS en France, mais :

- Le widget **"See What's In Store" (SWIS)** sur Google Business Profile est **INDISPONIBLE dans l'UE** (restrictions liees au RGPD/DMA)
- Les **Local Listings** (fiches produits dans Search, Maps, Images, Shopping) **FONCTIONNENT en France**
- Les **Local Inventory Ads** (payants) **FONCTIONNENT en France**

### Implication pour Two-Step

Le Local Inventory App est un **concurrent direct** pour les marchands qui utilisent deja un POS compatible. Mais :
- Il ne couvre pas tous les POS
- Il ne fait que scanner des codes-barres (pas de donnees enrichies)
- Two-Step apporterait un onboarding plus complet et une valeur ajoutee au-dela de Google

### Sources cles

- https://pointy.withgoogle.com/
- https://support.google.com/business/answer/9934993
- https://support.google.com/business/answer/13738641
- https://support.near.st/en/articles/6682840

---

## 6. Exemples de partenaires LFP

### NearSt (UK, global)

- **Fonde** : 2015 a Londres par Max Kreijn et Nick Brackenbury
- **Statut** : Google Local Feeds Partner + Meta Commerce Acceleration
- **Couverture** : 130+ systemes POS, 800 000+ points de vente, 1B+ lignes de stock traitees par jour
- **Modele** : abonnement mensuel ("low monthly fee") pour les marchands
- **Services** : onboarding complet, creation de flux, gestion LIA, dashboard de resultats, support 24/7
- **Avantage cle** : bypass de la verification Google (1-2 semaines au lieu de 3-6 mois)

### stockinstore (Australie, APAC)

- **Statut** : Premier partenaire LFP en APAC (approuve decembre 2023)
- **Clients** : Sportsgirl, T2 Tea, The North Face
- **Avantage** : activation en 1-2 semaines au lieu de 3-6 mois
- **Acces** : communication directe avec l'equipe Google Local Shopping

### City Hive (USA)

- **Specialite** : POS-to-Google pour commerces independants
- **Modele** : sync directe depuis le POS, pas besoin de site web
- **Claim** : "have your products listed online without ever having to build a website"

### Instacart / DoorDash / Uber Eats

- Ces services de **livraison** sont egalement des data providers pour Google
- Ils fournissent automatiquement l'inventaire en magasin a Google
- Modele different de Two-Step (ils sont des services de livraison, pas des marketplaces de decouverte)

### Lecons pour Two-Step

1. **La cle c'est le statut Trusted** : 5 marchands verifies = deblocage de l'onboarding rapide
2. **Le modele economique** : abonnement mensuel aupres des marchands
3. **La valeur** : simplifier un processus que 74% des marchands echouent a faire seuls
4. **L'echelle** : NearSt a mis des annees a atteindre 800K+ points de vente

### Sources cles

- https://blog.near.st/how-to-set-up-google-local-inventory-ads
- https://www.stockinstore.com/news/stockinstore-google-apac-local-feeds-partnership/
- https://www.cityhive.net/features/google-local-feed-partnership/

---

## 7. Specificites France

### Ce qui est DISPONIBLE en France

| Feature | Disponible ? | Notes |
|---------|-------------|-------|
| **Local Inventory Ads (LIA)** | OUI | France fait partie des 47+ pays supportes |
| **Free Local Listings** | OUI (avec nuance) | La liste officielle "Free Local Listings" est plus restreinte, mais les produits locaux apparaissent dans Search/Maps/Shopping en France |
| **Google Shopping** | OUI | Fully supported |
| **Google Maps product listings** | OUI | Via Local Listings |
| **"See What's In Store" (SWIS)** | NON | Widget indisponible dans l'UE |
| **Local Inventory App (ex-Pointy)** | PARTIEL | Depend du POS utilise |
| **Merchant Center en francais** | OUI | Interface et support en francais |
| **Langue des feeds** | Francais | Supporte nativement |

### Partenaires LFP connus en France

**Aucun partenaire LFP specifiquement francais n'a ete identifie dans cette recherche.** C'est potentiellement une **enorme opportunite** pour Two-Step.

Les partenaires existants (NearSt, stockinstore, City Hive) sont principalement actifs au UK, APAC, et USA.

### Reglementation

- Le RGPD/DMA bloque le widget SWIS mais pas les Local Listings ni LIA
- Les feeds doivent respecter les specifications locales (langue, devise EUR, etc.)
- La verification d'inventaire en magasin est possible en France

### Sources cles

- https://localranker.fr/google-local-inventory-ads/
- https://www.google.com/intl/fr_fr/retail/solutions/local-inventory-ads/
- https://support.google.com/merchants/answer/3271956

---

## 8. Plan d'action pour Two-Step

### Ce qu'on peut faire AUJOURD'HUI (aucune approbation requise)

1. **Creer un compte Google Merchant Center** avec un compte Google dedie a Two-Step
2. **Creer un projet Google Cloud** et configurer l'authentification (OAuth2 / Service Account)
3. **Etudier le Merchant API** en profondeur (documentation, sandbox)
4. **Demander la conversion en MCA** (Advanced Account) dans Merchant Center
5. **Preparer 5 marchands pilotes** avec magasins physiques pour les verifications d'inventaire

### Phase 1 : Candidature LFP Provider (Semaines 1-4)

| Etape | Action | Responsable |
|-------|--------|-------------|
| 1.1 | Creer le compte Google dedie `twostep-merchant@gmail.com` | Thomas |
| 1.2 | Creer le Merchant Center account | Thomas |
| 1.3 | Demander la conversion en MCA | Thomas |
| 1.4 | Creer le projet Google Cloud + activer Merchant API | Dev |
| 1.5 | Remplir le formulaire "Point-of-Sale Data Provider Feedback" | Thomas |
| 1.6 | Contacter Google pour activer les endpoints LFP | Thomas |

### Phase 2 : Implementation technique (Semaines 2-8)

| Etape | Action |
|-------|--------|
| 2.1 | Implementer l'authentification Service Account |
| 2.2 | Developper le module de soumission `lfpInventories:insert` |
| 2.3 | Developper le module de soumission `lfpStores:insert` |
| 2.4 | Developper le module de soumission `lfpSales:insert` |
| 2.5 | Developper le monitoring `lfpMerchantStates` |
| 2.6 | Mapper les donnees POS (Square/Shopify/Lightspeed) vers le format Google |
| 2.7 | Tester en sandbox avec des donnees de test |

### Phase 3 : Obtenir le statut Trusted (Semaines 4-12)

| Etape | Action |
|-------|--------|
| 3.1 | Onboarder 5 marchands pilotes (creer leurs sous-comptes MC) |
| 3.2 | Lier leurs Google Business Profiles |
| 3.3 | Soumettre leurs inventaires via l'API |
| 3.4 | Passer les 5 verifications d'inventaire en magasin |
| 3.5 | Obtenir le statut "Trusted" |

### Phase 4 : Scaling (apres le statut Trusted)

- Onboarding en 1-2 semaines par marchand (au lieu de 3-6 mois)
- Automatisation complete du pipeline POS -> Google
- Dashboard marchand dans Two-Step montrant les resultats Google

### Alternative rapide : approche hybride

**Si l'approbation LFP prend trop de temps**, Two-Step peut :

1. **Aider chaque marchand a creer son propre Merchant Center** (onboarding assiste)
2. Se faire ajouter comme **utilisateur admin** sur chaque compte MC
3. Soumettre les feeds via le **Merchant Inventories API** standard (pas LFP)
4. En parallele, continuer la candidature LFP pour le long terme

Cette approche hybride ne scale pas aussi bien mais permet de **demarrer immediatement**.

### Risques et points d'attention

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| Google refuse la candidature LFP | Bloquant | Approche hybride (gestion compte par compte) |
| Verification d'inventaire echoue | Retard | S'assurer de la qualite des donnees POS avant soumission |
| Content API sunset (18 aout 2026) | Technique | Implementer directement avec Merchant API |
| Concurrent existant en France | Business | Aucun partenaire LFP francais identifie = avantage first-mover |
| SWIS indisponible en UE | UX | Les produits apparaissent quand meme dans Search/Maps/Shopping |

---

## Annexe A : Architecture technique cible

```
[POS Marchand]          [Two-Step Backend]          [Google]
     |                        |                        |
     |-- sync inventaire ---->|                        |
     |                        |-- lfpStores:insert --->|
     |                        |-- lfpInventories ----->| Google Shopping
     |                        |-- lfpSales:insert ---->| Google Maps
     |                        |                        | Google Search
     |                        |<-- merchantStates -----|
     |                        |                        |
[Google Business Profile] <---> [Merchant Center Sub-Account]
```

## Annexe B : Format des donnees LFP Inventory

```json
{
  "targetAccount": "123456789",
  "storeCode": "STORE_001",
  "offerId": "SKU-12345",
  "regionCode": "FR",
  "contentLanguage": "fr",
  "gtin": "3614271234567",
  "price": {
    "amountMicros": "29990000",
    "currencyCode": "EUR"
  },
  "availability": "in stock",
  "collectionTime": "2026-03-31T10:00:00Z",
  "pickupMethod": "buy",
  "pickupSla": "same day"
}
```

## Annexe C : Liens de documentation essentiels

### Programme LFP
- Programme LFP : https://support.google.com/merchants/answer/7676652
- Onboarding data provider : https://support.google.com/merchants/answer/7676580
- Onboarding retailer : https://support.google.com/merchants/answer/15243706
- LIA Partner Program : https://support.google.com/merchants/answer/12342725

### Merchant API (LFP endpoints)
- LFP API overview : https://developers.google.com/merchant/api/guides/local-feeds-partnership/overview
- Manage LFP providers : https://developers.google.com/merchant/api/guides/accounts/manage-lfp-providers
- Migration LFP : https://developers.google.com/merchant/api/guides/compatibility/local-feeds-partnership
- Storebuilder Blueprint (deprecated mais instructif) : https://developers.google.com/merchant/storebuilder/local

### Merchant Center
- MCA setup : https://support.google.com/merchants/answer/14089347
- MCA documentation : https://support.google.com/merchants/answer/15623997
- Policies LIA/FLL : https://support.google.com/merchants/answer/3271956
- Local inventory data spec : https://support.google.com/merchants/answer/14819809

### Authentification
- Auth setup : https://developers.google.com/merchant/api/guides/quickstart/authentication
- OAuth : https://developers.google.com/shopping-content/guides/how-tos/authorizing
- Auth overview : https://developers.google.com/merchant/api/guides/authorization/overview

### France / Europe
- LIA France (Google) : https://www.google.com/intl/fr_fr/retail/solutions/local-inventory-ads/
- LIA explique (FR) : https://localranker.fr/google-local-inventory-ads/
- Free local listings : https://support.google.com/merchants/answer/14615117
