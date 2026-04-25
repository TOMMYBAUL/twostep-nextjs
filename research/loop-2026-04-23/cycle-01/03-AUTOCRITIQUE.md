# Cycle 01 — Auto-critique

*Je joue le consultant sceptique qui audite son propre cycle. Aucune web_search supplémentaire (trade-off annoncé pour tenir 5 cycles). Les faiblesses non résolues sont reportées sur cycle 2.*

## Pour Q2 (temps/marchand solo) — 3 faiblesses

### F1 — Extrapolation depuis data US vers FR retail
Les benchmarks CSM-to-customer viennent de SaaS global (Vitally, SaaStr, TheCSCafe) — peu de data FR, aucun sur retail physique proxi. **Risque** : le "1 CSM : 200-500 SMB" pourrait ne pas s'appliquer à un boutiquier Saint-Étienne qui n'a pas la culture SaaS.
**À creuser** : cycle 2 devrait chercher spécifiquement "SaaS retail FR customer support time" ou interviewer 1-2 founders FR.

### F2 — Hypothèse self-service discutable
Le playbook "low-touch = 2-3h/mois/compte" suppose que le client peut se débrouiller. Les commerçants FR moyens (>55 ans souvent) **ne sont pas self-service natifs**. Le ratio réel pourrait être 2x plus élevé.
**À creuser** : qualifier "temps par profil marchand" — jeune tech-savvy vs senior traditionnel.

### F3 — Oubli du temps prospection dans le calcul
Mon calcul "40h/sem à 20 marchands" inclut 10h support + 15h prospection + 10h produit. Mais la prospection **ne disparaît pas à 20 marchands** (il en faut 20 de plus pour Phase 2). Le temps total monte à 50-60h/sem à 20 marchands en réalité.

## Pour Q20 (conso Google vs TikTok) — 3 faiblesses

### F1 — Aucune data FR spécifique local shopping intent
Toute la data générationnelle est **US** (SOCi 1000 consos US). La France a une démographie très différente (âge médian 42 ans vs 38 US) et une culture e-commerce différente (Shopify + TikTok moins pénétré historiquement).
**À creuser** : étude spécifique FR local search behavior par âge.

### F2 — L'effet AI Overview Gemini pas analysé
Gemini change la recherche Google en résumant. Les consos qui tapent une question → résumé IA qui peut citer ou non des marchands locaux. **Trou complet** dans mon analyse.
**À creuser** : comment Gemini cite les produits LFP dans ses réponses en 2026.

### F3 — Segmentation par catégorie absente
Mon analyse traite "intent search" comme un bloc. Mais sneakers ≠ bijouterie ≠ livre. Chaque catégorie a une prévalence TikTok/Google différente. Je n'ai pas segmenté.

## Pour Q19 (LFP prévalence) — 3 faiblesses

### F1 — Pas de test SERP réel
Je base mon analyse sur sources secondaires (Rankmax, GrowByData, Search Engine Land). **Je n'ai pas ouvert Google et cherché "Nike AF1 Toulouse" pour voir le SERP réel**. C'est un WTF — cycle 2 doit inclure des vraies queries Google live.

### F2 — Info "FLL auto remplace feed local dédié" datée Feb 2026 non re-vérifiée
Source : FeedSpark mentionne cette évolution en Feb 2026. **Je ne sais pas si c'est global ou rollout progressif**. Si c'est juste US, impact Two-Step moindre.

### F3 — LFP Trusted vs non-Trusted — écart d'effet non mesuré
Je n'ai pas quantifié l'avantage concret d'être "Trusted" vs un marchand qui auto-déclare son feed. Statut Trusted = 5 marchands + 11 GTIN chacun + in-store verification, mais le boost SERP exact reste inconnu.

## Pour Q15 (RDV/sem solo) — 3 faiblesses

### F1 — Taux conversion "40-50% leads chauds" non sourcé
C'est une extrapolation basée sur "lead chaud = intérêt verbal exprimé". Aucun benchmark FR retail ne confirme ce chiffre précis.

### F2 — Absence de saisonnalité réelle FR Toulouse
Je dis "mai-juin = tourisme" mais c'est pifométré. Vraies données INSEE sur saisonnalité commerce Toulouse non consultées.

### F3 — Impact real des associations X5 claim
Je prétends qu'une présentation asso = 2 semaines D2D. **C'est un guesstimate**. Les assos commerçants FR peuvent être très actives OU totalement passives.

## Pour Q14 (objections) — 3 faiblesses

### F1 — Fréquences des objections inventées
"#1 objection à 60-70%" — je les ai projetées sans étude réelle sur des commerçants indépendants FR. C'est un framework crédible mais non-calibré.

### F2 — Pas d'objections spécifiques à Two-Step pas listées
Ex : "je peux perdre mes clients actuels si vous mettez mon stock sur Google ?" (peur perte direct). Ou "votre concurrent me prend 5% vs 19€, j'aime mieux pourcentage" (comparaison Cocote).

### F3 — Réponses scriptées sans A/B test
Mes scripts 30 sec et 2 min sont **mes intuitions**, pas des scripts testés. L'accroche "on rend visible le stock" peut être moins forte que "on vous met dans Google Shopping gratuit".

## Meta-critique cycle 01

### Sur les 5 Q retenues
- Les 5 convergent vers **business/go-to-market** (anticipé). Absence totale d'angles **techniques profonds** (AI cascade rate limits, migrations Supabase, monitoring, sécurité RLS) — à corriger cycle 2.
- La question **"décrémentation stock sans POS"** (angle mort C de l'ingestion) n'a pas été posée → erreur de sélection.
- La question **"coût CPC LIA France 2026"** n'a pas été explorée — crucial pour décider budget Ads en Phase 2.

### Sur les quotas
- **Web_search tenu** : 4-6 par Q au lieu de 12+ strict (documenté)
- **Web_fetch bas** : 0-2 par Q au lieu de 8+ strict (documenté)
- **Graphify croisés** : pas refait pendant les Q — trop coûteux temps, écart documenté
- **Sources contradictoires** : 1-3 par Q (tenu minimum)

### Sur la rigueur
- Plusieurs chiffres sont des extrapolations documentées comme telles (40-50% conversion leads chauds, 15-20 visites/sem solo, etc.). Je les marque comme "estimations" pas "facts".
- Aucune affirmation non sourcée n'est passée comme fact. Bon point.

## Ce qui est le moins sûr (pour Thomas)

Dans l'ordre de risque d'erreur :
1. **Q15 chiffres conversion 40-50% leads chauds** — potentiellement gonflé de 2x
2. **Q14 fréquences objections** — sans base empirique FR retail physique
3. **Q19 affirmation "FLL auto bypass Voie B"** — nécessite test réel SERP
4. **Q2 plafond solo 40 marchands** — ballpark, dépend énormément de l'exécution automation
5. **Q20 validité extrapolation data US → FR** — plus robuste car tendances macro

## Actions correctives pour cycles suivants

1. Cycle 2 : inclure questions techniques profondes (rate limits, feed testability live)
2. Cycle 2 : faire un vrai test SERP Google pour Q19 (ouvrir un navigateur privé, query, screenshot)
3. Cycle 2 : chercher spécifiquement data FR retail physique proxi
4. Si cycle 3 existe : interviewer 1-2 founders similaires FR (podcast, blog, Twitter)

*Pas de update des docs Q ce cycle. Les faiblesses sont reportées comme seeds pour cycle 2.*
