# Two-Step — Réception automatique de factures par email
**Date** : 2026-04-12
**Version** : 1.0
**Statut** : Validé Thomas

---

## Contexte

Les commerçants reçoivent toutes leurs factures fournisseurs par email. Plutôt que de leur demander de les uploader manuellement à chaque fois, on leur fournit une adresse email dédiée. Ils activent le transfert automatique dans leur boîte mail (30 secondes, une seule fois), et toutes leurs factures arrivent automatiquement dans Two-Step.

**Décision clé** : pas d'OAuth (accès à toute la boîte = frein de confiance). Le transfert email est universel (tous les fournisseurs email le supportent), respecte la vie privée (on ne scanne pas leur boîte), et ne dépend d'aucune API tierce.

---

## Architecture

### Service d'emails entrants

**Resend Inbound** sur le sous-domaine `in.twostep.fr`.

- 1 MX record à ajouter sur le sous-domaine
- Zéro impact sur l'email Infomaniak existant (bauland@twostep.fr)
- Gratuit jusqu'à 100 emails/jour (3 000/mois)
- Webhook vers `/api/inbound-email` à chaque email reçu

### Flux

```
Fournisseur envoie facture → boîte marchand → transfert auto → factures-{slug}@in.twostep.fr
                                                                        ↓
                                                              Resend webhook POST
                                                                        ↓
                                                          /api/inbound-email (Vercel)
                                                                        ↓
                                                         Extraire pièces jointes PDF/CSV/XLSX
                                                                        ↓
                                                         Ignorer si aucune PJ pertinente
                                                                        ↓
                                                         Pipeline existant (parsing IA → enrichissement)
                                                                        ↓
                                                         Facture visible dans onglet Entrées
                                                                        ↓
                                                         Marchand valide → stock mis à jour
```

### Filtrage côté serveur

Le marchand active le transfert global (tous ses emails). On reçoit donc aussi des emails non pertinents (newsletters, spam, perso). Règles de filtrage :

1. Vérifier que l'adresse destinataire correspond à un marchand actif
2. Extraire les pièces jointes PDF, XLSX, XLS, CSV uniquement
3. Si aucune PJ pertinente → supprimer immédiatement, ne rien stocker
4. Si PJ trouvée → injecter dans le pipeline `uploadInvoice` existant (même traitement que l'upload manuel)

**Aucun email personnel n'est stocké.** Seules les pièces jointes de facturation sont conservées.

---

## Données

### Table `merchants` — nouveau champ

| Champ | Type | Description |
|-------|------|-------------|
| `inbound_email_slug` | text, unique | Slug généré à l'inscription (ex: `dear-skin`). Adresse = `factures-{slug}@in.twostep.fr` |

Le slug est dérivé du `slug` existant du marchand. Pas de nouvelle table nécessaire.

### Table `email_connections` — existante

On ne l'utilise plus pour OAuth. On peut la réutiliser pour stocker le statut du transfert :
- `status: "active"` quand on reçoit le premier email via inbound
- `last_sync_at` mis à jour à chaque email reçu
- `provider: "inbound"` (nouveau type)

Ou plus simple : ne pas toucher cette table et utiliser uniquement `inbound_email_slug` sur `merchants` + le timestamp de la dernière facture reçue via email. Approche retenue : **pas de modification de `email_connections`**, on se base sur l'existence de factures avec `source = 'email'` pour déterminer le statut.

---

## UI — Onglet Entrées

### État 1 : email non configuré (aucune facture `source = 'email'` reçue)

Bandeau bleu au-dessus de la zone d'upload :
- Icône email + titre "Recevez vos factures automatiquement"
- Sous-titre : "Activez le transfert automatique depuis votre boîte mail."
- Adresse monospace : `factures-{slug}@in.twostep.fr` + bouton "Copier"
- Lien : "Comment activer le transfert automatique ? →" (ouvre un guide)

### État 2 : email actif (au moins 1 facture `source = 'email'` reçue)

Bandeau vert compact :
- Check vert + "Transfert email actif"
- Adresse + "Dernière facture reçue il y a X"
- Bouton discret "Copier l'adresse"

La zone d'upload se réduit (une seule ligne : "Importer un fichier manuellement").

### Tableau des factures

Colonne source ajoutée sous le nom du fournisseur :
- "via email" pour les factures arrivées par inbound
- "upload manuel" pour les factures uploadées

### Guide "Comment activer ?"

Bottom sheet ou page modale avec guides par fournisseur :
- Gmail — 3 étapes
- Outlook / Hotmail — 3 étapes
- Yahoo — 3 étapes
- Autre (Orange, Free, SFR...) — guide général

Chaque guide : texte pour V1, courtes vidéos/GIFs pour V2.

Message en bas : "Besoin d'aide ? Lors de notre prochaine visite, nous pouvons l'activer ensemble en 30 secondes."

---

## API

### POST `/api/inbound-email` (nouveau)

Webhook Resend. Reçoit le payload email entrant.

1. Valider la signature webhook Resend (sécurité)
2. Extraire l'adresse destinataire → lookup marchand via `inbound_email_slug`
3. Si marchand non trouvé → 200 OK (ignorer silencieusement)
4. Récupérer les pièces jointes via API Resend (`GET /received-emails/{id}/attachments`)
5. Filtrer : garder uniquement PDF, XLSX, XLS, CSV
6. Si aucune PJ pertinente → 200 OK (ignorer)
7. Pour chaque PJ : créer une entrée `invoices` avec `source = 'email'`, `sender_email = from`, uploader le fichier dans le bucket `invoices`
8. Déclencher le parsing IA (même pipeline que l'upload manuel)
9. Répondre 200 OK

### GET `/api/email/inbound-address` (nouveau)

Retourne l'adresse inbound du marchand connecté.

```json
{
  "address": "factures-dear-skin@in.twostep.fr",
  "has_received": true,
  "last_received_at": "2026-04-12T14:30:00Z"
}
```

---

## Backend existant à conserver

- `src/app/api/invoices/upload/route.ts` — upload manuel (inchangé)
- `src/app/api/invoices/[id]/validate/route.ts` — validation (inchangé)
- `src/app/api/invoices/[id]/activate/route.ts` — activation stock (inchangé)
- `src/lib/invoice/activate.ts` — logique activation (inchangé)
- `src/hooks/use-invoices.ts` — hook React (inchangé)

### Backend existant à supprimer (OAuth devenu inutile)

- `src/app/api/email/connect/route.ts` — OAuth flow
- `src/app/api/email/connect/callback/route.ts` — OAuth callback
- `src/app/api/email/disconnect/route.ts` — déconnexion OAuth
- `src/app/api/cron/scan-emails/route.ts` — cron scan inbox
- `src/lib/email/gmail.ts` — provider Gmail OAuth
- `src/lib/email/outlook.ts` — provider Outlook OAuth
- `src/lib/email/imap.ts` — provider IMAP
- `src/lib/email/encryption.ts` — chiffrement tokens
- `src/lib/auth/state-token.ts` — HMAC state pour CSRF
- `src/hooks/use-email.ts` — hook React OAuth

**Note** : supprimer progressivement, pas en bloc. D'abord construire l'inbound, puis retirer l'OAuth une fois validé.

---

## Migration Supabase

```sql
-- 057_inbound_email.sql
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS inbound_email_slug text UNIQUE;

-- Générer le slug pour les marchands existants (basé sur leur slug existant)
UPDATE merchants SET inbound_email_slug = slug WHERE inbound_email_slug IS NULL;
```

**Note** : la colonne `source` existe déjà sur `invoices` (migration 003, valeurs : `email`, `upload`, `einvoice`, `manual`). Le champ `sender_email` existe aussi. Aucune modification nécessaire sur `invoices`.

---

## Infra — Setup Resend Inbound

### Prérequis (action Thomas)

1. Créer un compte Resend (resend.com) et obtenir une API key
2. Ajouter le domaine `in.twostep.fr` dans Resend
3. Configurer le MX record sur le sous-domaine `in.twostep.fr` (chez Infomaniak)
4. Créer un webhook dans Resend pointant vers `https://twostep.fr/api/inbound-email`

### Variables d'environnement

```
RESEND_API_KEY=re_xxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxx
INBOUND_EMAIL_DOMAIN=in.twostep.fr
```

---

## Hors scope V1

- Vidéos/GIFs explicatives dans le guide (V2)
- Notifications push quand une facture arrive par email
- Détection intelligente du fournisseur (matching nom fournisseur existant)
- Dashboard stats : "X factures ce mois via email vs Y via upload"
