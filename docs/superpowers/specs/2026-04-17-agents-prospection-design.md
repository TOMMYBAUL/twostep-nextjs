# Agents de prospection autonomes Two-Step

*Date : 2026-04-17*
*Statut : Design valide*

## Contexte

Thomas travaille comme kine de 7h a 14h30. Il fait la prospection terrain l'apres-midi. Les agents font la prospection digitale 24/7 et preparent le terrain.

## Architecture : 5 agents schedules

### Agent 1 : L'Eclaireur
**Schedule** : chaque jour 5h30
**Mission** : Preparer la fiche de route terrain du jour

**Actions** :
1. Lire le fichier de tracking leads (`docs/prospection/leads-tracker.md`)
2. Identifier le quartier cible du jour (rotation : Carmes, Saint-Etienne, Saint-Cyprien, Capitole)
3. Rechercher 10 nouvelles boutiques via web search (Google Maps, Pages Jaunes, Instagram)
4. Pour chaque boutique trouvee :
   - Nom, adresse, type de commerce
   - Google Business Profile : note, nombre d'avis, existe ou non
   - Site web : existe ou non, mobile-friendly
   - Instagram : handle, nombre d'abonnes, derniere publication
   - Email : chercher sur le site web, Pages Jaunes, annuaires
5. Scorer chaque lead (segment brande, quartier cible, presence digitale)
6. Generer la fiche de route dans `docs/prospection/fiche-route-YYYY-MM-DD.md`
7. Mettre a jour `docs/prospection/leads-tracker.md`

**Output** : fiche de route avec 5-8 boutiques a visiter, ordonnees par potentiel, avec briefing personnalise pour chacune.

### Agent 2 : L'Auditeur
**Schedule** : chaque jour 6h00
**Mission** : Creer des audits de visibilite et rediger les emails personnalises

**Actions** :
1. Lire `docs/prospection/leads-tracker.md` — prendre les leads avec email qui n'ont pas encore ete contactes
2. Pour chaque lead (max 5/jour) :
   a. Scraper le site web (Firecrawl) si existant
   b. Verifier Google Business Profile
   c. Verifier presence Google Shopping
   d. Verifier Instagram (engagement, frequence de post)
   e. Generer un score de visibilite /10
3. Rediger un email personnalise (methode ACA Hormozi) :
   - Acknowledge : reference specifique a la boutique (produit vu sur Instagram, avis Google, vitrine)
   - Compliment : ce qu'ils font bien
   - Ask : proposition Two-Step avec l'audit integre
4. Creer le brouillon dans Gmail (via Gmail MCP) avec objet personnalise
5. Logger dans `docs/prospection/emails-envoyes.md`

**Templates email** : utiliser les sequences de `twostep-content/prospecting/kit-prospection/sequences-email.md` comme base, personnaliser avec les donnees de l'audit.

**Regle semaine 1** : brouillons uniquement, Thomas valide depuis son telephone.
**Regle semaine 2+** : envoi direct, max 5/jour.

### Agent 3 : Le Relanceur
**Schedule** : chaque jour 10h, 15h, 19h
**Mission** : Monitorer les reponses et relancer automatiquement

**Actions** :
1. Checker Gmail (via Gmail MCP) pour les reponses aux emails de prospection
2. Categoriser chaque reponse :
   - **Interesse** : rediger un brouillon de reponse + notifier Thomas par email avec le sujet "[HOT LEAD]"
   - **Pas maintenant** : programmer relance J+14 dans le tracker
   - **Non** : logger la raison, marquer comme "do not contact"
   - **Question** : rediger une reponse basee sur `twostep-content/prospecting/kit-prospection/guide-objections.md`
3. Verifier les relances a faire (basee sur dates dans le tracker) :
   - J+3 sans reponse : envoyer relance sequence 2
   - J+7 sans reponse : envoyer relance sequence 3
   - J+14 sans reponse : derniere relance "il reste X places"
4. Mettre a jour `docs/prospection/leads-tracker.md` avec les statuts

### Agent 4 : Le Veilleur de Signaux
**Schedule** : chaque jour 6h30
**Mission** : Detecter les opportunites en temps reel

**Actions** :
1. Rechercher les nouvelles immatriculations commerce a Toulouse (web search Pappers.fr, Societe.com)
2. Rechercher "ouverture boutique Toulouse", "nouveau commerce Toulouse" sur le web
3. Verifier les hashtags Instagram #boutiquetoulouse #commercetoulouse #nouvelleconcept
4. Chercher les avis Google negatifs mentionnant "pas en stock", "deplacement pour rien", "ferme" sur les boutiques du quartier cible
5. Pour chaque signal detecte :
   - Enrichir le lead (email, Instagram, site)
   - Marquer comme "SIGNAL" dans le tracker avec le type de signal
   - Si email trouve : le placer en priorite pour l'Auditeur du lendemain

### Agent 5 : Le Stratege
**Schedule** : chaque dimanche 20h
**Mission** : Rapport hebdo + formation marketing

**Actions** :
1. Compiler les metriques de la semaine depuis le tracker :
   - Nouveaux leads trouves
   - Emails envoyes
   - Reponses recues (par categorie)
   - Visites terrain effectuees (si Thomas met a jour le tracker)
   - Taux de reponse par quartier / segment / template
2. Analyser ce qui marche vs ce qui ne marche pas
3. Suggerer les ajustements pour la semaine suivante :
   - Quel quartier cibler
   - Quel template email privilegier
   - Quels leads prioriser
4. **Mini-cours marketing** : chaque semaine, un concept applique aux resultats reels
   - Semaine 1 : methode ACA Hormozi
   - Semaine 2 : signal-based selling
   - Semaine 3 : pricing psychology (anchoring, FOMO)
   - Semaine 4 : storytelling Callaway
   - Semaine 5 : Dream 100 / access points
   - Semaine 6 : referral / bouche a oreille
5. Ecrire le rapport dans `docs/prospection/rapport-hebdo-YYYY-WXX.md`

## Fichiers de persistance

Les agents utilisent des fichiers Markdown comme "base de donnees" :

### `docs/prospection/leads-tracker.md`
```markdown
# Leads Tracker Two-Step

## Stats
- Total leads : X
- Contactes : X
- Reponses : X
- Interesses : X
- Signes : X

## Leads

| Boutique | Quartier | Segment | Email | Instagram | Score | Statut | Signal | Date contact | Relance |
|---|---|---|---|---|---|---|---|---|---|
| Dear Skin | Carmes | Cosmetique | dearskinshop@icloud.com | @dearskin | 9/10 | INTERESSE | terrain | 2026-04-11 | — |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
```

### `docs/prospection/emails-envoyes.md`
Log de chaque email envoye avec date, destinataire, objet, template utilise, statut reponse.

### `docs/prospection/fiche-route-YYYY-MM-DD.md`
Fiche de route quotidienne pour le terrain.

## Regles de securite

1. **Max 5 emails/jour** — proteger la reputation du domaine twostep.fr
2. **Jamais d'email le weekend** — les commercants ne lisent pas
3. **Brouillons semaine 1** — calibration du ton avec Thomas
4. **Stop si taux de bounce > 5%** — verifier la qualite des emails
5. **Jamais de mensonge** — pas de faux compteurs, pas de fausses references
6. **RGPD** : les emails B2B de prospection sont autorises en France sous "interet legitime" mais chaque email doit inclure un lien de desinscription ou une mention "repondez STOP"

## Infrastructure

- **Gmail MCP** : lecture/ecriture emails, brouillons
- **Firecrawl MCP** : scraping sites web
- **Web Search** : recherche Google, Instagram, Pages Jaunes
- **Fichiers locaux** : tracker, fiches routes, rapports

## Metriques de succes

| Metrique | Cible semaine 1 | Cible mois 1 |
|---|---|---|
| Leads trouves | 30 | 100+ |
| Emails envoyes | 10 (brouillons valides) | 80 |
| Taux de reponse | — | 5-10% |
| Leads interesses | — | 4-8 |
| Marchands signes | 1-2 (terrain) | 5-10 |
