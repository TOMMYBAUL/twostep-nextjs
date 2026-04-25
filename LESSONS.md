# LESSONS — Erreurs récurrentes et solutions

Ce fichier est la mémoire long-terme de Claude Code sur ce projet.
À consulter au début de chaque session et avant toute tâche similaire à une entrée existante.

## Format
Chaque entrée : contexte minimal, erreur faite, solution correcte, date.

## Supabase
(vide — à remplir au fil de l'eau)

## Sécurité
- ❌ `decrypt()` fail-open silencieux (`if (!ciphertext.includes(":")) return ciphertext;`) acceptait n'importe quel token non-chiffré sans erreur. Risque : fuite Vercel env = fuite TOUS tokens POS marchands. Fix : versioning format `v1:iv:tag:ciphertext` + flag `STRICT_DECRYPT=true` qui throw au lieu de fail-open. Migration tokens DB obligatoire AVANT activation strict via `scripts/migrate-encrypt-tokens.mjs`. Rollout 5 phases : déploy fix transitoire → migrate DB → audit Sentry → set STRICT → redeploy. Branche `fix/encryption-fail-open` (2026-04-25)

## Next.js / Vercel
(vide)

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

## Architecture / dette tech
- ❌ Brainstorm archi qui ignore les externes nouveaux : ACP OpenAI (lancé 2026-02), AI Act art.50 (2 août 2026), CRA EU (11 sept 2026), Google product ID split (mars 2026), Inngest orchestrator pour pipelines >5 étapes. **Checklist obligatoire début cycle archi** : "qu'est-ce qui a changé dans l'écosystème depuis 30j ?" Brainstorm 04-24 a raté tout ça → V2 consolidée 2026-04-25 = `docs/ARCHITECTURE-TWOSTEP.md` (2026-04-25)
- ❌ Présenter `ean_lookups` cache cross-marchand comme "moat data juridique" — faux : non protégeable (art. L341-1 CPI), réplicable concurrent en 3-6 mois via Open Food Facts / Open Beauty Facts / UPCitemdb publics. **Vrai moat** = densité géo + relation marchand + statut LFP Trusted (admin) + UX dirty→clean. Requalifier partout en "accélérateur opérationnel" (2026-04-25)
- ❌ Plan SaaS solo qui suppose 50 marchands an 1 sans embauche : NearSt = 1 emp/100 marchands. Bandwidth Thomas réelle = 24-32 marchands max mois 4-12 (5h/marchand/an support consomme bandwidth démarchage). **Gate Phase 5** : embauche 0.5 ETP OU contrat formel apporteurs à 15 marchands (2026-04-25)

## Boucles de recherche autonome (multi-cycles)
- ❌ Stopper à 3 cycles sur 5 annoncés "parce que rendement décroissant ressenti" → le cycle 5 a produit les 2 meilleurs insights (UCP + Fédé). Quand un quota numéraire est annoncé (au user OU à soi-même), tenir le quota — l'instinct de rendement décroissant n'est pas fiable, les angles changent (2026-04-23 boucle nuit, voir META-REPORT)
- ❌ Annoncer "quotas tenus" quand on est à 10-20% du volume promis → marquer explicitement "[ESTIMATION]" sur les chiffres non-sourcés et écrire un META-REPORT honnête en fin de boucle (2026-04-23)
- ❌ Faire une boucle de recherche sans **clôture brain Nexus** → les insights restent dans `research/loop-XXX/` et s'évaporent. Règle : tout insight à impact MAJEUR doit être poussé en fiche brain dans la même session que la boucle, sinon il n'existe pas dans 3 mois (2026-04-23)
- ❌ Créer une nouvelle fiche brain alors qu'une fiche existe déjà → toujours grep `04-Partenariats/`, `09-Veille/` etc. avant de créer. Si contradiction avec fiche existante, **expliciter la contradiction dans la fiche** (Update YYYY-MM-DD), ne jamais écraser silencieusement (2026-04-23 cas Fédé Toulouse)
