# Drafts emails juridique — Phase 0

> Drafts prêts à copier-coller. Adapte les infos de contact et personnalise si nécessaire (ne pas oublier la signature manuelle).
> Mis à jour : 2026-04-25

---

## Email 1 — Avocat (Captain Contrat / LegalStart / Dougs)

**À** : [adresse contact du cabinet choisi]
**De** : bauland@twostep.fr
**Sujet** : Devis pack juridique CGU/CGV/RGPD/DSA — SaaS B2B Two-Step

---

Bonjour,

Je me permets de vous contacter pour solliciter un devis concernant un pack juridique complet pour Two-Step, un SaaS B2B retail tech basé en France (twostep.fr). La société est en phase de lancement commercial avec une première facturation marchands prévue mai-juin 2026. Effectif < 10 salariés, chiffre d'affaires < 2 M€.

**Délivrables attendus :**

- **CGU B2B marchands** conformes au Règlement P2B (UE 2019/1150) : préavis de 30 jours en cas d'éviction de la plateforme, nomination de deux médiateurs, procédure notice & action pour les litiges entre marchands et la plateforme
- **CGV B2C** distinctes pour les utilisateurs finaux de l'application de découverte de stock (consommateurs)
- **Privacy Policy + DPA** conformes au RGPD (traitement de données marchands et consommateurs, sous-traitants : Supabase, Stripe, Anthropic, Cloudflare)
- **Clause licence photos produit** conforme à l'article L131-3 du CPI, couvrant trois sources : photos fournies par le marchand, photos issues de factures fournisseur, et photos issues de scraping public (sites fabricants / distributeurs en read-only)
- **Clause ODbL "Produced Work"** pour l'utilisation en lecture seule d'Open Food Facts et Open Beauty Facts comme source d'enrichissement produit (cascade enrichissement, pas de redistribution de la base brute)
- **Clause AI disclosure** conforme à l'article 50 du Règlement européen sur l'IA (entrée en vigueur 2 août 2026) : Two-Step utilise Claude Vision (Anthropic) pour enrichir automatiquement les descriptions et catégories produit à partir de photos
- **Clause de limitation de responsabilité B2B** (périmètre : marchands indépendants, pas de consommateurs finaux dans ce contrat)
- **Clause notice DSA** (Règlement UE 2022/2065) adaptée à un intermédiaire SaaS de taille réduite

**Contraintes pratiques :**
- Budget cible one-shot : entre 3 900 et 7 050 € HT
- Délai souhaité : 3 à 4 semaines (contrainte commerciale impérative)
- Merci d'indiquer si le devis vaut engagement de confidentialité ou si un NDA séparé est requis avant échange de documents

Je reste disponible pour un échange téléphonique si des précisions sont nécessaires avant établissement du devis.

Cordialement,

Thomas Bauland
Fondateur — Two-Step
bauland@twostep.fr | twostep.fr

---

## Email 2 — Stello (RC Pro + Cyber)

**À** : contact@stello.eu (ou formulaire devis sur stello.eu)
**De** : bauland@twostep.fr
**Sujet** : Devis RC Pro + Cyber — SaaS B2B (Two-Step, founder solo)

---

Bonjour,

Je cherche à souscrire une assurance Responsabilité Civile Professionnelle et une couverture Cyber pour mon activité SaaS B2B. Je sollicite plusieurs assureurs afin de comparer les offres.

**Contexte :**
- Société : Two-Step, SaaS B2B retail tech (twostep.fr)
- Activité : plateforme de synchronisation et d'enrichissement de stock pour commerces indépendants, abonnement mensuel
- Structure : entreprise individuelle / SASU (fondateur solo, Thomas Bauland), < 10 salariés, CA < 2 M€
- Stack technique : Next.js, Supabase (PostgreSQL hébergé UE), Stripe, Cloudflare R2, Anthropic Claude Vision
- Données traitées : tokens d'API POS marchands (chiffrés AES-256, versionning de clé en place), données catalogue produits, aucune donnée bancaire consommateur stockée en propre (délégué à Stripe)

**Couvertures souhaitées :**

1. **RC Professionnelle** : périmètre activité éditeur de logiciel SaaS B2B, responsabilité en cas de bug ou interruption de service impactant les marchands clients
2. **Cyber** : couverture data breach (notification CNIL, frais de gestion), ransomware, et incident response. Two-Step stocke des tokens POS marchands ; une fuite constituerait un incident notifiable
3. **Clause incapacité temporaire** : en tant que fondateur solo, je dispose d'un playbook de continuité opérationnelle documenté (`docs/continuity-playbook.md`) permettant un fonctionnement réduit en cas d'arrêt > 5 jours. La police doit permettre ce fonctionnement réduit pendant la période d'incapacité sans rupture de contrat ou suspension automatique de couverture

**Budget cible :** 1 200 – 2 500 € / an

Pouvez-vous m'adresser un devis ou m'indiquer la procédure pour obtenir une cotation en ligne ?

Cordialement,

Thomas Bauland
Fondateur — Two-Step
bauland@twostep.fr | twostep.fr

---

## Email 3 — Orus (RC Pro + Cyber)

**À** : contact@orus.eu (ou formulaire devis sur orus.eu)
**De** : bauland@twostep.fr
**Sujet** : Devis RC Pro + Cyber — SaaS B2B (Two-Step, founder solo)

---

Bonjour,

Je cherche à souscrire une assurance Responsabilité Civile Professionnelle et une couverture Cyber pour mon activité SaaS B2B. Je sollicite plusieurs assureurs afin de comparer les offres.

**Contexte :**
- Société : Two-Step, SaaS B2B retail tech (twostep.fr)
- Activité : plateforme de synchronisation et d'enrichissement de stock pour commerces indépendants, abonnement mensuel
- Structure : entreprise individuelle / SASU (fondateur solo, Thomas Bauland), < 10 salariés, CA < 2 M€
- Stack technique : Next.js, Supabase (PostgreSQL hébergé UE), Stripe, Cloudflare R2, Anthropic Claude Vision
- Données traitées : tokens d'API POS marchands (chiffrés AES-256, versionning de clé en place), données catalogue produits, aucune donnée bancaire consommateur stockée en propre (délégué à Stripe)

**Couvertures souhaitées :**

1. **RC Professionnelle** : périmètre éditeur de logiciel SaaS B2B, responsabilité en cas de bug ou interruption de service impactant les marchands clients. Si Orus propose une garantie spécifique aux éditeurs de logiciels à composante IA (enrichissement automatique de données produit via Claude Vision), merci de l'inclure dans le devis
2. **Cyber** : couverture data breach (notification CNIL, frais de gestion), ransomware, et incident response. Two-Step stocke des tokens POS marchands chiffrés ; une fuite constituerait un incident notifiable
3. **Clause incapacité temporaire** : fondateur solo disposant d'un playbook de continuité opérationnelle. La police doit permettre un fonctionnement réduit pendant la période d'incapacité sans suspension automatique de couverture

**Budget cible :** 1 200 – 2 500 € / an

Pouvez-vous m'adresser un devis ou m'indiquer la procédure pour obtenir une cotation en ligne ?

Cordialement,

Thomas Bauland
Fondateur — Two-Step
bauland@twostep.fr | twostep.fr

---

## Suivi

Une fois les emails envoyés, MAJ `docs/prospection/leads-tracker.md` avec les dates réelles d'envoi et de réponse attendue.
