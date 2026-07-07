# Envoyer aux 254 boutiques depuis ton adresse actuelle (sans nouveau domaine)

Décidé le 2026-07-08 : Thomas ne veut pas de domaine secondaire. Voici comment le faire
proprement depuis `contact@twostep.fr` (ou ton Gmail), sans cramer ta réputation.

## Ce que dit ta config DNS (vérifié le 2026-07-08)

- `twostep.fr` : SPF autorise **Infomaniak** (`spf.infomaniak.ch`) + Cloudflare (réception).
- **DMARC = `p=reject`** → domaine strict et **bien vu** des fournisseurs mail. Bon pour toi.
- Réception via Cloudflare Email Routing (forward vers ta boîte).

**Conséquence** : `contact@twostep.fr` est un expéditeur crédible. Pour envoyer AVEC cette
adresse, il faut passer par **le SMTP Infomaniak** (le canal que ton SPF autorise) — pas par
un envoi Gmail « brut » qui, lui, ne serait pas aligné et **serait REJETÉ** par ton propre
DMARC. Deux chemins concrets ci-dessous.

## La règle d'or (celle qui protège ton adresse)

Le danger n'est PAS les 254 en soi — c'est la **façon** d'envoyer. À bannir absolument :
- ❌ un seul mail en **BCC à 254 adresses** → spam instantané + réputation flinguée ;
- ❌ 254 mails identiques envoyés en 10 minutes.

Ce qu'il faut faire :
- ✅ **1 mail individuel par boutique**, personnalisé (nom de l'enseigne), via un outil de
  **mail-merge** ;
- ✅ **débit lent : 30 à 40/jour**, étalé sur ~7 jours. 254 / 35 ≈ **8 jours**.
- ✅ **ligne de désinscription** (« répondez STOP ») = obligation RGPD + réduit les plaintes ;
- ✅ texte simple, **1 seul lien** (twostep.fr), 0 image, 0 pièce jointe.

À 35/jour avec personnalisation et opt-out, le risque sur ton adresse est **faible et maîtrisé**
— très différent d'un blast. Honnêteté : ce risque n'est pas *nul* (c'est pour ça que la
séparation de domaine existe), mais à ce volume et avec ces précautions, c'est raisonnable.

## Chemin recommandé — Mailmeteor (le plus simple, gratuit à ce volume)

1. Ouvre le CSV `mailmerge-toulouse-2026-07-08.csv` dans **Google Sheets** (254 lignes :
   `enseigne`, `email`, `categorie`, `quartier`, `ville`).
2. Installe le module **Mailmeteor** (Extensions → Modules → Mailmeteor). Gratuit jusqu'à
   ~50 mails/jour, désinscription incluse, envoie **1:1 depuis ton adresse**.
3. **Choisir l'expéditeur** :
   - **Option A (recommandée) : `contact@twostep.fr`.** Dans Gmail → Paramètres → « Comptes »
     → « Envoyer des e-mails en tant que » → ajoute `contact@twostep.fr` via le **SMTP
     Infomaniak** (serveur `mail.infomaniak.com`, port 465 SSL, ton identifiant Infomaniak).
     Ainsi l'envoi est aligné SPF/DKIM Infomaniak → passe ton DMARC reject, et le pro s'affiche.
     ⚠️ Vérifie juste dans le manager Infomaniak que **DKIM est activé** pour twostep.fr.
   - **Option B (repli) : ton Gmail `thomasbauland1304@gmail.com`.** Aligné nativement, zéro
     réglage. Moins « pro » aux yeux d'un commerçant, mais fonctionne tout de suite.
4. Rédige le modèle avec les balises de fusion (voir ci-dessous). Mailmeteor remplace
   `{{enseigne}}` par le nom de chaque boutique.
5. **Programme 35 envois/jour** (Mailmeteor permet de planifier / tu envoies par lots).
   Relance unique à J+4 sur les non-répondants.

> Alternatives équivalentes si tu préfères : **YAMM** (Yet Another Mail Merge) ou **GMass** —
> même principe (add-on Gmail, envoi depuis ton adresse, throttling). Mailmeteor a la
> désinscription RGPD la plus simple.

## Le modèle à coller dans Mailmeteor (avec balises de fusion)

**Objet** : Une question rapide pour {{enseigne}}

> Bonjour,
>
> Je m'appelle Thomas, je lance **Two-Step** à Toulouse : quand un habitant cherche un produit
> sur Google (« bottines cuir Toulouse », etc.), il voit **les boutiques d'à côté qui l'ont en
> stock, en temps réel** — au lieu de tomber seulement sur Amazon.
>
> On démarre avec un petit groupe de boutiques pionnières du centre, et je pensais à
> {{enseigne}} pour en faire partie.
>
> Ça vous dit d'en discuter 10 min, par téléphone ou autour d'un café dans votre boutique ?
> Répondez juste « oui » et je m'adapte à votre agenda.
>
> Belle journée,
> Thomas — Two-Step
> [ton téléphone] · www.twostep.fr
>
> *Si vous ne souhaitez pas être recontacté, répondez STOP.*

## Ordre d'attaque conseillé (pour trouver un pilote vite)

1. **Jour 1-2** : les ~30 boutiques avec un vrai `contact@[nom].fr` (indépendants clairs) +
   les concept stores / mode / chaussures (tes meilleures cibles produit).
2. En parallèle, **appelle** les 10-15 plus prometteuses (tu as les téléphones) — le tel
   convertit mieux qu'un mail pour un commerçant.
3. Le reste de la liste par lots de 35/jour.
