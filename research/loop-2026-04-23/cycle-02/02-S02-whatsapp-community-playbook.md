# S2 — Playbook WhatsApp community Two-Step marchands

*Quotas : 1 web_search. Confidence 7.5/10.*

## Findings

### WhatsApp technical limits

- **Groupe simple** : max 1 024 membres
- **Community (feature 2023+)** : 50 groupes × 1 024 = jusqu'à **51 200 membres**
- **Announcement group** dans une Community : 5 000 membres
- Admins et moderators avec permissions granulaires

### Best practices gouvernance B2B

- **Structure modulaire** : petits groupes par sujet (pas 1 groupe énorme)
- **Announcement group central** pour infos critiques
- **Moderators au-delà de 1000 membres** (pas un enjeu Two-Step Phase 1-2)
- **Rules clair dès J1** : ce qui est pour un sujet vs l'autre, horaires, tone

### Pour un B2B SaaS

- Groupe WhatsApp = **plus engagé** que Slack ou Discord (canal personnel)
- Mais **plus intrusif** — notifications qui pop sur le tel perso
- Risque : marchands qui mutent le groupe = effet nul

## Application Two-Step

### Architecture proposée (ajustée aux volumes FR retail physique)

**Phase 1 (5-15 marchands Saint-Étienne)** :
- 1 seul groupe : *"Two-Step Saint-Étienne"*
- Thomas admin + propriétaire
- Règles simples postées en description :
  1. Questions produit OK
  2. Demandes de fonctionnalités bienvenues
  3. Partager les bonnes surprises clients
  4. Horaires raisonnables (pas 23h)

**Phase 2 (15-40 marchands Toulouse) — passage à Community** :
- Community *"Two-Step Toulouse"*
- 3 groupes :
  - *"Saint-Étienne quartier"*
  - *"Carmes / Saint-Rome"*
  - *"Annonces Two-Step"* (announcement group, silent)

**Phase 3 (40+ marchands, multi-quartiers)** :
- Community par ville
- Thomas recrute un marchand-ambassadeur par quartier comme co-admin

### Gains anticipés

1. **Réduction support 40-60%** (cf. Q2 cycle 01) — marchands s'entraident
2. **Social proof instantané** — quand un marchand ajoute une belle review client, tous voient
3. **Canal direct Thomas → marchands** pour annonces (Black Friday, tips)
4. **Détection early churn** — marchand qui quitte le groupe = signal fort

### Risques identifiés

1. **Spam / hors sujet** — règle J1 claire + moderation
2. **Marchand-toxique** — un marchand qui critique en boucle peut empoisonner. Fix : conversation 1:1 et éventuel removal
3. **Fatigue notification** — si 5 msg/jour, les marchands mutent. Fix : limiter les annonces à 2-3/semaine max
4. **Confidentialité commerciale** — 2 marchands concurrents voient leurs questions/données. Fix : règle "pas de prix détaillés, pas de stratégie commerciale"

### Tactics avancées

1. **Welcome message automatique** (via WhatsApp Business API si passe en paid) avec:
   - Guide onboarding Two-Step PDF
   - Vidéo Loom Thomas welcome
   - Règles du groupe
   - Numéro direct en cas de blocker
2. **"Metric Monday"** : chaque lundi, Thomas poste un chiffre clé (ex: "48 impressions Google pour Dear Skin cette semaine")
3. **"Win Wednesday"** : invite les marchands à partager leur meilleure vente de la semaine
4. **Audit quarterly** : qui contribue, qui lit, qui mute → Thomas ajuste

## Alternatives considérées et rejetées

### Pourquoi pas Slack ?
- Slack = culture tech, peu adoptée par retailers FR
- Notifications moins immédiates
- App séparée à télécharger

### Pourquoi pas Telegram ?
- Moins utilisé par commerçants FR (~5% vs WhatsApp ~95%+)

### Pourquoi pas un forum web ?
- Friction : il faut se connecter, pas push notif
- Engagement historique 10x plus faible qu'un groupe WhatsApp

**WhatsApp = le bon canal** pour la cible retail FR physique.

## Recommandations actionnables

1. **Créer le groupe dès le 2e marchand signé** (pas attendre 5)
2. **Règles postées et épinglées** dès J1
3. **Thomas actif 15 min/jour max** en groupe (cadence soutenable)
4. **Passer à Community à 15 marchands** (plus de gestion clean)
5. **Demander à Dear Skin Shop (1er potentiel)** de co-piloter le groupe comme "ambassadeur"

## Confidence : 7.5/10

Playbook solide, basé sur best practices généralistes + logique adaptée retail FR. La validation réelle se fera à l'usage.

## Sources

- [Mastering WhatsApp Communities for Business Growth — Bot.space](https://www.bot.space/blog/deep-dive-mastering-whatsapp-communities-for-business-growth)
- [WhatsApp Business Communities — Chatarmin](https://chatarmin.com/en/blog/create-a-whats-app-business-community)
- [How to manage a community on WhatsApp — Community-Led Growth](https://www.communityledgrowth.com/how-to-manage-a-community-on-whatsapp/)
- [Setting up Your Community — WhatsApp Official](https://www.whatsapp.com/communities/learning/settingupyourcommunity)
