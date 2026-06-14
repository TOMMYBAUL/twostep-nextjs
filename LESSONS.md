# LESSONS — Erreurs récurrentes et solutions

Ce fichier est la mémoire long-terme de Claude Code sur ce projet.
À consulter au début de chaque session et avant toute tâche similaire à une entrée existante.

## Format
Chaque entrée : contexte minimal, erreur faite, solution correcte, date.

## Supabase
(vide — à remplir au fil de l'eau)

## Sécurité
- ❌ `decrypt()` fail-open silencieux (`if (!ciphertext.includes(":")) return ciphertext;`) acceptait n'importe quel token non-chiffré sans erreur. Risque : fuite Vercel env = fuite TOUS tokens POS marchands. Fix : versioning format `v1:iv:tag:ciphertext` + flag `STRICT_DECRYPT=true` qui throw au lieu de fail-open. Migration tokens DB obligatoire AVANT activation strict via `scripts/migrate-encrypt-tokens.mjs`. Rollout 5 phases : déploy fix transitoire → migrate DB → audit Sentry → set STRICT → redeploy. Branche `fix/encryption-fail-open` (2026-04-25)

## Ops / résilience (V3, 2026-06-13)
- ❌ `instrumentation.ts` sans `export const onRequestError = Sentry.captureRequestError` → les crashs non catchés des Server Components / route handlers ne remontent JAMAIS à Sentry. Ajouté.
- ❌ `resync-stock` écrivait `last_sync_status:"ok"` même quand des upserts stock échouaient (`if(!error) updated++` avalait l'erreur) → dérive de stock derrière un voyant vert. Fix : captureError par échec + statut "partial" si writeErrors>0.
- ❌ `google-feed` : token Google expiré → `errors++; continue` silencieux (feed mort sans signal) ; et poussait TOUS les produits du marchand (pas de filtre visible/validated) = produits non identifiés sur Google Shopping. Fix : statut "error"+Sentry sur token absent, gate `visible+validated+!archived+!variant` sur le SELECT, statut "partial" si pushed<eligible.
- ⚠️ `STRICT_DECRYPT=true` PAS activable tel quel : 1 token legacy (non `v1:`) dans `pos_connections` → throw au décryptage = POS down. Migrer via `scripts/migrate-encrypt-tokens.mjs` AVANT activation. (0 token POS dans merchant_pos_credentials, 0 Google.)
- Backup DB : `.github/workflows/db-backup.yml` (pg_dump quotidien → artefact 30j). Nécessite le secret GitHub `SUPABASE_DB_URL` (connection directe port 5432, pas le pooler).

## Next.js / Vercel
- ❌ `vercel env add` par stdin PowerShell enregistre des valeurs VIDES (et l'argument positionnel est refusé par CLI ≥54.13) → utiliser `--value` ou l'API REST (`POST /v10/projects/{id}/env?upsert=true`, token dans `%APPDATA%\xdg.data\com.vercel.cli\auth.json`). Vérifier avec `vercel env pull` + longueur des valeurs. (2026-06-13)
- ❌ Script npm `prepare` (`git config core.hooksPath`) casse `npm install` sur Vercel (pas de .git en build CLI) → wrappé dans node try/catch. (2026-06-13)
- ❌ Le pre-push (tests DB-live) échoue en TLS sans `$env:NODE_OPTIONS='--use-system-ca'` → le poser avant tout `git push` depuis Claude Code. (2026-06-13)

## Sécurité RLS (audit 2026-06-13)
- ❌ Tester une protection sur une base sans données = faux négatif. La RLS `products`/`stock`/`merchants` était `USING(true)` (001 jamais resserrée) ; le test anon renvoyait `[]` UNIQUEMENT car 0 produit `visible=false` n'existait. Toujours croiser test live + lecture du code + raisonnement sur l'état futur (1er marchand avec pending/masked = fuite). Fix 097.
- ❌ Column-grant (`REVOKE/GRANT SELECT(cols)`) sur une table référencée par le sous-select d'une policy RLS d'une AUTRE table → `permission denied` en cascade (révoquer merchants.user_id a cassé la lecture anon de products). Solution : encapsuler le cross-table dans une fonction `SECURITY DEFINER` (`auth_owns_merchant`). Fix 098. **Toujours re-tester les surfaces publiques en anon après un REVOKE.**
- ❌ Deux overloads d'une RPC (avec/sans param `DEFAULT`) = `PGRST203` ambigu → route morte. Garder UNE signature par nom. Fix 099 (feed/discover/promos étaient cassés en prod).

## Données produit (taille / catégorie / available_sizes)
- ❌ Le parseur de fichier (detectColumns) ne reconnaissait AUCUNE colonne taille/pointure → tailles perdues pour les exports `nom|taille|qté|prix` (cas mode/sneakers). Ajouté SIZE_HEADERS + ParsedInvoiceItem.size ; snapshot préfère la colonne (fiable) à extractSize(nom) (déduit). available_sizes porte `source` (file_column|name_regex|pos). (2026-06-14)
- ❌ groupVariantsByEAN réécrivait `available_sizes` depuis `products.size` (NULL pour les produits-fichier, dont les tailles sont groupées en mémoire par le snapshot) → écrasait les tailles par `[]`. Deux mécanismes de groupage concurrents. Rendu non-destructif : n'écrit available_sizes que si des tailles sont calculées. Trouvé par e2e (available_sizes vide après push). (2026-06-14)
- ❌ categorize appliquait la catégorie IA sans seuil de confiance → fausses catégories. Seuil 70 ; en dessous, pas appliquée mais tentative marquée (sélection sur ai_categorized_at null = anti-reboucle). (2026-06-14)
- ⚠️ Rappel : l'EAN donne l'IDENTITÉ (nom/marque/photo/catégorie brute), JAMAIS la taille ni la quantité (données de la source marchand). KicksDB (sneakers, exploite le SKU) est inerte sans KICKSDB_API_KEY (gratuite).

## Gate visibilité produits
- ❌ `groupVariantsByEAN` (sync-engine, post-pass appelé par ingestion + POS) rendait visibles (stock>0) tous les produits dont `review_status !== 'pending_review'` — donc aussi les `'pending'`/`'masked'` du gate cascade (089), court-circuitant le "zéro faux positif". Masqué tant que l'enrichissement tournait INLINE juste après (il re-settait visible) ; révélé par le découplage async V2. Fix : ne rendre visible QUE `review_status === 'validated'` (NULL = legacy/default validated OK). Détecté par l'e2e local (visible=true/score=null avant worker). (2026-06-13)
- ⚠️ Hot-reload Next/turbopack ne prend pas toujours un changement de lib importée par une route API → si un fix ne se reflète pas en e2e, **redémarrer le dev server** (kill port 3000) avant de conclure que le fix est faux. (2026-06-13)

## Schéma DB
- ❌ Migration qui documente de nouvelles valeurs d'enum/CHECK sans ALTÉRER la contrainte (081 vs 089 : `review_status` 'pending'/'masked' refusés en prod pendant des semaines, toute création produit du pipeline cassée). Détecté uniquement par le e2e d'ingestion. Règle : toute nouvelle valeur d'état → grep le CHECK existant dans les migrations AVANT. Fix : 096. (2026-06-13)

## Git / workflow
- ❌ Ne jamais commiter directement sur main → toujours créer une branche feat/<nom>
- ❌ Email git : ne pas utiliser thomasbauland1304@gmail.com → utiliser bauland@twostep.fr
- ❌ Push sans lancer `npm run test:run` → CI rouge = révélé au mail GitHub. Hook pre-push installé le 2026-04-22 dans `.githooks/pre-push` (tests + tsc auto). Activation : `npm run prepare` (auto après clone via npm). Bypass urgence : `SKIP_PRE_PUSH=1 git push`

## Fix bug cross-module
- ❌ Corriger un code sans mettre à jour les tests qui référencent l'ancienne valeur → grep la constante/valeur dans `tests/` avant commit. Commit `1e45f3d fix(google): align LFP feed format` a corrigé `feed.ts` mais pas `feed.test.ts` → 2 tests failaient depuis (2026-04-22)

## Claude Code / environnement Windows
- ❌ Sur Windows, winget et npm installent deux versions de Claude Code → mettre à jour les DEUX à chaque fois
- ❌ Bun 1.3.11 crashe (Illegal instruction) en subprocess Windows → `bun upgrade` vers ≥ 1.3.13 (2026-04-22)
- ❌ `/plugin marketplace add X` + `/plugin install Y` sur la MÊME ligne : Claude Code concatène → lancer chaque slash command séparément (2026-04-22)

## Outillage installé
- **graphify** : graphe de connaissances codebase, output dans `graphify-out/` (ignoré par git). Mettre à jour via `/graphify` ou `graphify update .`
- **claude-mem** (v12.3.8) : mémoire auto de sessions Claude Code. Worker sur port 37777, DB `~/.claude-mem/claude-mem.db`. Outils MCP `mcp__plugin_claude-mem_mcp-search__*`
- **gitnexus** : index de code sémantique (1937 symbols). Hook PostToolUse ré-indexe après commit/merge. MCP tools `mcp__gitnexus__*`
- **parallel** (plugin `parallel@parallel-agent-skills`, v=?) : recherche web via API Parallel.ai. 6 skills : setup/status/result/web-search/data-enrichment/web-extract/deep-research. `/parallel:setup` pour init CLI + API key (pas encore fait)
- **deep-research** (skill) : cloné dans `~/.claude/skills/deep-research/`, utilise WebSearch/WebFetch natifs en fallback (search-cli non installé sur Windows, SERPER + FIRECRAWL disponibles côté Two-Step mais pas encore piped)

## Règle d'arbitrage — outils de recherche
- Question sur lib/API → **Context7** (`mcp__context7__*`)
- Contexte code projet → **gitnexus** (`gitnexus_query/context/impact`)
- Contexte business/Nexus Obsidian → **nexus-twostep-brain** MCP
- Recherche web standard → **Parallel** (plugin)
- Recherche approfondie (comparatif, état de l'art, décision critique) → **deep-research** skill
- `WebSearch` natif → fallback uniquement si rien d'autre n'est dispo

## Builder-bias / décisions
- ❌ Recommander un outil payant "par défaut" (ex : Pennylane PDP 20 €/mo Phase 0) sans valider l'urgence RÉELLE vs alternative gratuite (PPF État, gratuit, suffit à 0-10 marchands). À 0 marchand payant aujourd'hui, le coût caché de cette reco aurait été 120-160 € sur 6-8 mois inutiles. **Question à se poser systématiquement avant d'ajouter un outil au plan** : "Est-ce que la gratuité officielle (PPF, free tier, etc.) couvre les besoins jusqu'à la prochaine inflexion ?" Pattern documenté 2026-04-25 par Thomas qui a challengé. (2026-04-25)
- ❌ Pousser pour avocat (5 000-7 000 € HT) + RC Pro (1 500 €/an) **dès Phase 0** à 0 marchand payant. Sur-investissement avant validation marché. Règle Thomas : **« les démarches juridiques se font quand le SaaS fonctionne »** — drafts emails OK comme ressources, envoi différé jusqu'à 1+ marchand payant + 30 jours sans incident. Vrai trigger légal obligatoire = bascule micro→SASU (Phase 5). (2026-04-25)
- ❌ Présumer une équipe (ex : "Thomas + frère") basée sur d'anciennes fiches mémoire sans vérifier l'état actuel. **Violation R4 du CLAUDE.md global**. Toujours re-poser la question avant d'écrire "Thomas + X" dans un doc de continuité. À la place : "Thomas + tiers de confiance (à désigner)". (2026-04-25)

## Architecture / dette tech
- ❌ Brainstorm archi qui ignore les externes nouveaux : ACP OpenAI (lancé 2026-02), AI Act art.50 (2 août 2026), CRA EU (11 sept 2026), Google product ID split (mars 2026), Inngest orchestrator pour pipelines >5 étapes. **Checklist obligatoire début cycle archi** : "qu'est-ce qui a changé dans l'écosystème depuis 30j ?" Brainstorm 04-24 a raté tout ça → V2 consolidée 2026-04-25 = `docs/ARCHITECTURE-TWOSTEP.md` (2026-04-25)
- ❌ Présenter `ean_lookups` cache cross-marchand comme "moat data juridique" — faux : non protégeable (art. L341-1 CPI), réplicable concurrent en 3-6 mois via Open Food Facts / Open Beauty Facts / UPCitemdb publics. **Vrai moat** = densité géo + relation marchand + statut LFP Trusted (admin) + UX dirty→clean. Requalifier partout en "accélérateur opérationnel" (2026-04-25)
- ❌ Plan SaaS solo qui suppose 50 marchands an 1 sans embauche : NearSt = 1 emp/100 marchands. Bandwidth Thomas réelle = 24-32 marchands max mois 4-12 (5h/marchand/an support consomme bandwidth démarchage). **Gate Phase 5** : embauche 0.5 ETP OU contrat formel apporteurs à 15 marchands (2026-04-25)

## Boucles de recherche autonome (multi-cycles)
- ❌ Stopper à 3 cycles sur 5 annoncés "parce que rendement décroissant ressenti" → le cycle 5 a produit les 2 meilleurs insights (UCP + Fédé). Quand un quota numéraire est annoncé (au user OU à soi-même), tenir le quota — l'instinct de rendement décroissant n'est pas fiable, les angles changent (2026-04-23 boucle nuit, voir META-REPORT)
- ❌ Annoncer "quotas tenus" quand on est à 10-20% du volume promis → marquer explicitement "[ESTIMATION]" sur les chiffres non-sourcés et écrire un META-REPORT honnête en fin de boucle (2026-04-23)
- ❌ Faire une boucle de recherche sans **clôture brain Nexus** → les insights restent dans `research/loop-XXX/` et s'évaporent. Règle : tout insight à impact MAJEUR doit être poussé en fiche brain dans la même session que la boucle, sinon il n'existe pas dans 3 mois (2026-04-23)
- ❌ Créer une nouvelle fiche brain alors qu'une fiche existe déjà → toujours grep `04-Partenariats/`, `09-Veille/` etc. avant de créer. Si contradiction avec fiche existante, **expliciter la contradiction dans la fiche** (Update YYYY-MM-DD), ne jamais écraser silencieusement (2026-04-23 cas Fédé Toulouse)
