# Action Plan Two-Step — dérivé de la boucle 2026-04-23

*Thomas, voici les 8 actions priorisées pour les 7 prochains jours + 10 questions que je te pose pour cadrer la suite.*

---

## Les 8 actions prioritaires (ordre d'exécution)

### A1 — Lundi matin (1h) — AUDIT SÉCURITÉ RLS SUPABASE
**Priorité : P0. Effort : 30-60 min. Impact : évite data leak catastrophique pré-1er marchand.**

3 queries SQL à exécuter dans Supabase SQL Editor :
```sql
-- 1. Tables sans RLS
SELECT tablename FROM pg_tables t
LEFT JOIN pg_class c ON t.tablename = c.relname
WHERE schemaname = 'public' AND c.relrowsecurity = false;

-- 2. Tables avec RLS mais sans policy
SELECT t.tablename FROM pg_tables t
LEFT JOIN pg_class c ON t.tablename = c.relname
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE schemaname = 'public' AND c.relrowsecurity = true AND p.policyname IS NULL;

-- 3. Tables sans index sur merchant_id
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_indexes WHERE indexdef LIKE '%merchant_id%'
  );
```
→ Documenter résultats dans `docs/security/rls-audit-2026-04-23.md`. Fixer les policies manquantes avant prospection.

### A2 — Lundi matin (30 min) — TEST SERP GOOGLE LIVE
**Priorité : P0. Effort : 15-30 min. Impact : décide stratégie Voie B LFP (implémenter ou pas).**

En Chrome privé mobile, queries :
- "Nike Air Force 1 Toulouse"
- "sneakers Toulouse acheter"
- "boutique streetwear Toulouse"
+ un produit du seed Sole Store

Screenshot chaque SERP. Noter :
- Bloc "In Stores Nearby" présent ?
- Quels marchands y apparaissent ?
- Sole Store seed y apparaît-il ? (test FLL auto)

Résultat → `docs/research/serp-test-live-2026-04-23.md`

### A3 — Lundi après-midi (1h) — APPELS PROSPECTION FÉDÉ + CCI
**Priorité : P0. Effort : 2×30 min. Impact : X5-X10 vélocité prospection.**

1. **fede-toulouse.fr** : appeler secrétariat, identifier :
   - Nom + téléphone président asso quartier Saint-Étienne
   - Prochaine AG ou rencontre ouverte
   - Possibilité présenter Two-Step en 5 min

2. **CCI Toulouse Haute-Garonne** : appeler conseil commerce, demander :
   - Conditions exactes Pass Occitanie 2026 pour abo SaaS
   - Liste complète dispositifs digitalisation Occitanie 2026
   - Email d'un conseiller digitalisation pour accompagnement

### A4 — Lundi-Mardi (2h) — SHORTLIST LEADS PREMIUM
**Priorité : P0. Effort : 2h. Impact : premier signing en 2-3 semaines.**

Ajouter aux 5 leads chauds existants :
- **Dear Skin Shop** (déjà prévu)
- **Panorama Toulouse** (panorama-tlse.fr, sneakers indépendant)
- **The Last Step** (thelaststep.fr, sneakers Toulouse + Biarritz + Montpellier)
- 2 autres leads associations via A3

Préparer pour chacun :
- Script pitch adapté (jeune urbain tech-savvy) → 2-min version
- Proposition affiliate 100% (Hormozi) pour Dear Skin : 228€/an par marchand ref
- Screenshot SERP live (A2) si pertinent

### A5 — Lundi soir (1h) — SCRIPT + MATERIEL TERRAIN
**Priorité : P1. Effort : 1h. Impact : consistence pitch semaine 1.**

1. Imprimer carte de visite + Kbis + mini-pitch 1 page
2. Revisiter les 10 réponses objections (cycle 01 Q14) à voix haute 3 fois
3. Préparer slide 5 min "présentation Two-Step" pour AG asso (A3)
4. Charger téléphone = démo live SERP + dashboard Sole Store

### A6 — Mardi-Mercredi (matinée) — TERRAIN VISITES
**Priorité : P0. Effort : 10-15h/sem sur 6 semaines. Impact : 5-7 signatures cible.**

- Jour par jour cible : 3-5 RDV préflight call + 5-8 D2D + 2-3 follow-ups
- Leads chauds d'abord (Dear Skin, Panorama, TLS, 2 assos)
- Journal quotidien : visites, conversions, objections → ajuster pitch chaque semaine

### A7 — Semaine 1 (side quest 1h) — CERTIFICATION GOOGLE ADS
**Priorité : P2. Effort : 1-2h. Impact : prép Phase 2 Google Partner.**

Passer les certifications Google Ads gratuites (partners.google.com) :
- Search
- Shopping (utile pour Two-Step)
- Measurement

Badge personnel Thomas → crédibilité vis-à-vis marchands + prep future Google Partner statut.

### A8 — Semaine 1 (2h en fin de semaine) — CRÉER WHATSAPP COMMUNITY
**Priorité : P1 (enclencher dès 2e marchand signé). Effort : 2h. Impact : -40-60% support solo.**

1. Créer groupe "Two-Step Saint-Étienne" quand 2e marchand signe
2. Règles épinglées dès J1 (cycle 02 S2 playbook)
3. Thomas actif 15 min/jour max, pas plus
4. "Metric Monday" + "Win Wednesday" rituels
5. Passer en Community à 15 marchands signés

---

## Actions Phase 2 (reportées mais validées)

- **Implémenter Upstash QStash** + rate limiter Groq quand 3e marchand bootstrap CSV
- **Pop-up "café Two-Step"** organisé Saint-Étienne à 2-3 signatures (200-500€ budget)
- **Script test webhook automatique** (test signatures invalides + replay)
- **Évaluer Dev tier Groq 5$/mo** quand 5 marchands bootstrapent la même semaine
- **Meta Catalog feed** implémentation après 20 marchands Google LFP actifs

## Actions Phase 3+ (surveillance)

- **UCP / Business Agent Google rollout FR** : s'abonner Google Commerce blog + MC release notes
- **Google Partner certification agence** — dès 50 marchands
- **Architecture feed multi-canal** (Google + Meta + TikTok) — évaluer à 50 marchands

---

## 10 questions précises que je pose à Thomas au réveil

1. **Fédé Toulouse** : tu veux que je te rédige le template email d'intro à leur président cette semaine ?
2. **Pass Occitanie** : es-tu OK pour intégrer la mention "50% subventionné CCI" dans le pitch avant de vérifier ? Ou tu préfères confirmation CCI avant ?
3. **Affiliate 100% Dear Skin** : es-tu d'accord sur le principe ou tu as une structure commissions différente ?
4. **RLS audit** : tu veux que je rédige le script Node.js de test automatique (query anonymous check d'un autre merchant_id) ?
5. **Test SERP** : tu veux que je prépare le template `docs/research/serp-test-live-2026-04-23.md` avec les colonnes à remplir ?
6. **UCP / Business Agent Google** : impact potentiel énorme, tu veux que je fasse un cycle 6 dédié à ça ou tu préfères reporter à une session de veille stratégique ?
7. **Writeback POS** : vu le nouveau contexte (FLL auto + Business Agent), est-ce qu'on maintient le chantier en pause ou on le kill définitivement ?
8. **Frère cofounder** : à partir de quel seuil marchands (30 ? 50 ?) tu veux formaliser son rôle pour éviter le plafond solo 40 ?
9. **Outil CS low-cost** : Crisp, Tidio ou Intercom Fin ? Budget toléré 50-150€/mois ? Ou tu veux rester WhatsApp-only Phase 1 ?
10. **Google Ads certifications** : veux-tu que je te cherche les liens exacts des modules à passer (Search, Shopping, Measurement) ou tu préfères le faire direct sur partners.google.com ?

---

## Mesure de succès à 6 semaines

- **Cible ajustée** : 7 signatures (non 5, buffer no-show)
- **Pipeline warm** : >30 RDV qualifiés issus des 3 canaux (D2D, Fédé, apporteurs)
- **Audit sécu** : RLS + HMAC validés, test signup E2E OK
- **Community WhatsApp** : actif à 3+ marchands avec Metric Monday régulier
- **Test FLL auto** : documenté dans brain, Voie B décidée
