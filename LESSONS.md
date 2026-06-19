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

## OAuth caisses (POS) — revue Collecte ① (2026-06-17)
- ❌ `state` OAuth signé HMAC mais SANS expiration ni anti-rejeu → un state capturé est rejouable indéfiniment. Fix : timestamp signé + rejet >10 min (state-token.ts) + tests.
- ❌ Lightspeed `exchangeCode` ne vérifiait pas `res.ok` → `expires_in` undefined → `new Date(NaN).toISOString()` crash / token vide stocké comme valide. Fix : garde res.ok + access_token + défaut expires_in.
- ❌ Shopify `exchangeCode` POSTait le `client_secret` vers `https://${shop}/...` sans valider `shop` → SSRF/fuite secret. Fix : regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`.
- ✅ CORRIGÉ (2026-06-17, finalisation OAuth) : scope Lightspeed → `employee:inventory_read` (moindre privilège, lecture catalogue+stock) ; refresh dédupliqué via `ensureFreshAccessToken` (le sync FAISAIT déjà le refresh — c'était de la DUPLICATION, pas un trou ; l'audit s'était trompé, vérifié) ; HMAC Shopify du callback vérifié (`verifyShopifyOAuthHmac`) ; watchdog reconnexion (quality-check → alerte `pos_disconnected` si last_sync_status='error', migration 105).
- ⏳ STRICT_DECRYPT : code prêt, **bloqué par 1 token legacy = connexion Square du compte "Two-Step Test"**. Activable après suppression de ce test + set env Vercel prod. Décision Thomas (ne pas supprimer sa connexion de test sans accord).
- ⚠️ NB config externe : changer le scope Lightspeed dans le code exige que l'app OAuth enregistrée chez Lightspeed autorise `employee:inventory_read` (console dev Lightspeed) — à vérifier avant la 1re connexion réelle.

## Next.js / Vercel
- ❌ `vercel env add` par stdin PowerShell enregistre des valeurs VIDES (et l'argument positionnel est refusé par CLI ≥54.13) → utiliser `--value` ou l'API REST (`POST /v10/projects/{id}/env?upsert=true`, token dans `%APPDATA%\xdg.data\com.vercel.cli\auth.json`). Vérifier avec `vercel env pull` + longueur des valeurs. (2026-06-13)
- ❌ Script npm `prepare` (`git config core.hooksPath`) casse `npm install` sur Vercel (pas de .git en build CLI) → wrappé dans node try/catch. (2026-06-13)
- ❌ **NetLimiter** (`nllMonFltProxy`, var `SSLKEYLOGFILE`) intercepte le TLS sortant ; sa CA racine n'est dans aucun magasin → git (`schannel: SEC_E_UNTRUSTED_ROOT`) ET node (`unable to verify the first certificate`, même avec `--use-system-ca`) cassent par intermittence. Fixes durables : (1) git en **SSH** (`git@github.com:...`, clé ed25519 sans passphrase, NetLimiter ne touche pas le port 22) ; (2) gate pre-push **déterministe** = `test:run` exclut `tests/db/**` (réseau live) → tests live isolés dans `npm run test:db` (vitest.config.db.ts), à lancer en CI. Vraie correction de fond = désactiver l'inspection TLS de NetLimiter ou whitelister node/git. (2026-06-18)

## Sécurité RLS (audit 2026-06-13)
- ❌ Tester une protection sur une base sans données = faux négatif. La RLS `products`/`stock`/`merchants` était `USING(true)` (001 jamais resserrée) ; le test anon renvoyait `[]` UNIQUEMENT car 0 produit `visible=false` n'existait. Toujours croiser test live + lecture du code + raisonnement sur l'état futur (1er marchand avec pending/masked = fuite). Fix 097.
- ❌ Column-grant (`REVOKE/GRANT SELECT(cols)`) sur une table référencée par le sous-select d'une policy RLS d'une AUTRE table → `permission denied` en cascade (révoquer merchants.user_id a cassé la lecture anon de products). Solution : encapsuler le cross-table dans une fonction `SECURITY DEFINER` (`auth_owns_merchant`). Fix 098. **Toujours re-tester les surfaces publiques en anon après un REVOKE.**
- ❌ Deux overloads d'une RPC (avec/sans param `DEFAULT`) = `PGRST203` ambigu → route morte. Garder UNE signature par nom. Fix 099 (feed/discover/promos étaient cassés en prod).

## Données produit (taille / catégorie / available_sizes)
- ❌ Le parseur de fichier (detectColumns) ne reconnaissait AUCUNE colonne taille/pointure → tailles perdues pour les exports `nom|taille|qté|prix` (cas mode/sneakers). Ajouté SIZE_HEADERS + ParsedInvoiceItem.size ; snapshot préfère la colonne (fiable) à extractSize(nom) (déduit). available_sizes porte `source` (file_column|name_regex|pos). (2026-06-14)
- ❌ groupVariantsByEAN réécrivait `available_sizes` depuis `products.size` (NULL pour les produits-fichier, dont les tailles sont groupées en mémoire par le snapshot) → écrasait les tailles par `[]`. Deux mécanismes de groupage concurrents. Rendu non-destructif : n'écrit available_sizes que si des tailles sont calculées. Trouvé par e2e (available_sizes vide après push). (2026-06-14)
- ❌ categorize appliquait la catégorie IA sans seuil de confiance → fausses catégories. Seuil 70 ; en dessous, pas appliquée mais tentative marquée (sélection sur ai_categorized_at null = anti-reboucle). (2026-06-14)
- ⚠️ Rappel : l'EAN donne l'IDENTITÉ (nom/marque/photo/catégorie brute), JAMAIS la taille ni la quantité (données de la source marchand). KicksDB (sneakers, exploite le SKU) est inerte sans KICKSDB_API_KEY (gratuite).

## Modèle de données stock (cœur "data propre", 2026-06-17)
- ❌ La table stock ne traçait PAS la source ({quantity, updated_at} seulement) → la confidence DÉDUISAIT la force de source du pos_item_id (mensonge possible : un produit POS ajusté à la main restait "temps réel/Disponible"). Fix 104 : colonnes `stock.source` + `source_ts`, chaque writer déclare sa source (webhook/pos_sync/file_push/scan/invoice/cloture/manual), confidence lit `sourceStrengthFromStored(stock.source)`. Fallback legacy resolveSourceStrength conservé.
- ❌ `update_stock_atomic` last-write-wins naïf : un REPLACE pouvait écraser une vérité plus fraîche. Fix 104 : garde anti-régression (mode absolute n'écrase pas si source_ts entrant < source_ts en base ; delta s'applique toujours). ⚠️ LIMITE : le cas "fichier périmé écrase webhook récent" n'est PAS résolu (on n'a pas l'heure de génération du fichier — source_ts=now() à réception). Résolution multi-source complète = **ledger append-only**, différé jusqu'à volume/multi-canal réel.
- ⚠️ Pour changer la signature d'une RPC appelée par PostgREST : DROP + CREATE (pas CREATE OR REPLACE avec params en plus → crée un overload ambigu PGRST203).
- ❌ Garde INERTE faute de câblage : la garde anti-régression absolue de `update_stock_atomic` (source_ts entrant < base → no-op) ne servait à RIEN car les 4 routes webhook appelaient `updateStockAtomic(...,"webhook")` sans passer `sourceTs` → défaut `now()` (réception serveur), jamais l'heure réelle. Out-of-order Square/Zettle (absolu) = le périmé écrasait le frais. Fix : router `update.updated_at` (déjà calculé par parseWebhookEvent) en `sourceTs`. **Règle : un param de sécurité optionnel d'une RPC doit être vérifié comme RÉELLEMENT passé par tous les appelants — sinon la garde est cosmétique.** (Collecte ③, 2026-06-19)

## Gate visibilité produits
- ❌ `groupVariantsByEAN` (sync-engine, post-pass appelé par ingestion + POS) rendait visibles (stock>0) tous les produits dont `review_status !== 'pending_review'` — donc aussi les `'pending'`/`'masked'` du gate cascade (089), court-circuitant le "zéro faux positif". Masqué tant que l'enrichissement tournait INLINE juste après (il re-settait visible) ; révélé par le découplage async V2. Fix : ne rendre visible QUE `review_status === 'validated'` (NULL = legacy/default validated OK). Détecté par l'e2e local (visible=true/score=null avant worker). (2026-06-13)
- ⚠️ Hot-reload Next/turbopack ne prend pas toujours un changement de lib importée par une route API → si un fix ne se reflète pas en e2e, **redémarrer le dev server** (kill port 3000) avant de conclure que le fix est faux. (2026-06-13)

## Schéma DB
- ❌ Migration qui documente de nouvelles valeurs d'enum/CHECK sans ALTÉRER la contrainte (081 vs 089 : `review_status` 'pending'/'masked' refusés en prod pendant des semaines, toute création produit du pipeline cassée). Détecté uniquement par le e2e d'ingestion. Règle : toute nouvelle valeur d'état → grep le CHECK existant dans les migrations AVANT. Fix : 096. (2026-06-13)

## Git / workflow
- ❌ Ne jamais commiter directement sur main → toujours créer une branche feat/<nom>
- ❌ Email git : ne pas utiliser thomasbauland1304@gmail.com → utiliser bauland@twostep.fr
- ❌ Push sans lancer `npm run test:run` → CI rouge = révélé au mail GitHub. Hook pre-push installé le 2026-04-22 dans `.githooks/pre-push` (tests + tsc auto). Activation : `npm run prepare` (auto après clone via npm). Bypass urgence : `SKIP_PRE_PUSH=1 git push`

## Parsing / data-integrity (Collecte ⑤ + Triage, 2026-06-19)
- ❌ `Number(x) || défaut` détruit un **0 légitime** (prix attesté gratuit, qté en rupture) ET, pour la qté, `Number(null)===0` / `Number("")===0` (pas NaN !) → un champ ABSENT devient 0 au lieu du défaut "présence". Règle : garder la valeur BRUTE (`x != null && x !== ""`) avant de tester `Number.isFinite`, ne retomber sur le défaut que si vraiment absent/illisible. (parseJsonResponse, spreadsheet, einvoice-cii, parse-price callers.)
- ❌ Texte extrait d'un XML par **regex** sans décoder les entités → toute marque avec `&` (D&G, H&M, obligatoirement `&amp;` en XML valide) stockée polluée. Décoder numériques + nommées, `&amp;` EN DERNIER (anti double-décode). (parseCiiXml)
- ❌ Matching SKU en **exact-case** alors que l'EAN est canonique et le nom normalisé → `REF-001` (CSV) vs `ref-001` (POS) = doublon. `.toLowerCase()` des 2 côtés (set + get). (match-product.ts ; snapshot.ts le faisait déjà → asymétrie).
- ✅ **Avant de "corriger" un champ côté WRITE, vérifier comment le READ le consomme.** `available_sizes` inclut qty=0 mais TOUS les consommateurs filtrent `qty>0` à la lecture (product-detail, route facette) → ce n'était PAS un bug. L'agent Explore signale des "bugs" qu'il faut vérifier dans le code réel (plusieurs étaient faux : orphelin DB inexistant car insert APRÈS upload ; prix 0 déjà géré dans shared.ts). Zéro complaisance = lire, pas croire l'audit.

## Fix bug cross-module
- ❌ Corriger un code sans mettre à jour les tests qui référencent l'ancienne valeur → grep la constante/valeur dans `tests/` avant commit. Commit `1e45f3d fix(google): align LFP feed format` a corrigé `feed.ts` mais pas `feed.test.ts` → 2 tests failaient depuis (2026-04-22)

## Claude Code / environnement Windows
- ❌ Sur Windows, winget et npm installent deux versions de Claude Code → mettre à jour les DEUX à chaque fois
- ❌ Bun 1.3.11 crashe (Illegal instruction) en subprocess Windows → `bun upgrade` vers ≥ 1.3.13 (2026-04-22)
- ❌ `/plugin marketplace add X` + `/plugin install Y` sur la MÊME ligne : Claude Code concatène → lancer chaque slash command séparément (2026-04-22)
- ❌ Un script `.ps1` exécuté par le Planificateur (PowerShell 5.1) DOIT être en **ASCII pur** (ou UTF-8 **avec BOM**) : un `.ps1` UTF-8-sans-BOM contenant emoji/accents est lu en ANSI → **erreur de parsing → exit 1, le script ne démarre même pas** (aucun log). Symptôme vécu : tâche `TwoStepAutonomy` LastResult=0x1 sans log, 0 notif (2026-06-19). `scripts/autonomy-run.ps1` gardé ASCII pur ; vérifier via `[Parser]::ParseFile` + compter les octets >127.

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
