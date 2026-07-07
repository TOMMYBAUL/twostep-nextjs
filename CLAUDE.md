# CLAUDE.md — twostep-nextjs

Application **Next.js (App Router)** du projet **Two-Step** : rendre visible en ligne, de façon fiable, le stock réel des commerçants indépendants (pilote Toulouse, cible Google "acheter près de chez moi" / LFP). C'est le repo actif principal du workspace.

> Ce fichier décrit le projet réel. Ne pas se fier à d'anciennes mentions de Vite/localhost:5173 : le projet est du Next.js pur.

## Stack réelle

- **Next.js App Router** + Turbopack en dev, TypeScript strict
- **Supabase** : auth SSR (`@supabase/ssr`), Postgres, migrations dans `supabase/migrations/`
- **Stripe** (abonnements marchands 3 paliers), **Resend** (emails), **R2/S3** (images), **Upstash** (rate-limit), **Sentry** (monitoring)
- **UI : Tailwind CSS v4 + Untitled UI + react-aria-components** (stack validée, ne pas remplacer)
- **Tests : Vitest** — hooks git configurés via `core.hooksPath .githooks`
- Ingestion POS : email-in (IMAP/`postal-mime`), parsers CSV/PDF (`papaparse`, `pdf-parse`), scan code-barres (`@zxing/browser`)

## Commandes

| Tâche | Commande |
|---|---|
| Dev | `npm run dev` (Turbopack, localhost:3000) |
| Build | `npm run build` |
| Tests | `npm run test:run` — DB : `npm run test:db` |
| Seed démo Toulouse | `npm run seed` |

## Structure

- `src/app/` — routes : `(consumer)`, `(marketing)`, `dashboard/` (marchand), `admin/`, `api/`, `auth/`, `onboarding/`
- `src/lib/` — modules métier : `stock/`, `pos/`, `ingest/`, `enrichment/`, `ean/`, `identifiers/`, `merchants/`, `products/`, `invoice/`, `stripe/`, `supabase/`, `google/`, `email/`, `motion.ts`
- `src/components/`, `src/hooks/`, `src/providers/`, `src/styles/`
- `supabase/migrations/` — schéma DB versionné
- `scripts/` — seed, autonomie (`autonomy.mcp.json`)

## Conventions UI

- Imports `react-aria-components` toujours préfixés `Aria*` (`import { Button as AriaButton } ...`)
- Design tokens Untitled UI (`bg-primary`, `bg-brand-solid`, `text-tertiary`…) — rester dans le système, ne pas inventer de classes ad hoc
- **DA officielle : « Minuit électrique » — accent `#4268FF`**, référence : `charte graphique/twostep_brand_identity_minuit_electrique.html`
  ⚠️ `docs/brand-guidelines.md` (ochre) est **PÉRIMÉ** — ne jamais re-skinner en ochre
- Motion : constantes partagées de `src/lib/motion.ts` (`SPRING`, `SOFT_SPRING`, `slideUp`, `scaleUp`, `stagger`) ; respecter `prefers-reduced-motion`
- Toute copie visible par l'utilisateur en **français** — voir `.claude/skills/french-copy.md`
- **Règle Thomas : toute modification UI = validation visuelle par Thomas avant d'être considérée finie.** Backend/pipeline/migrations = autonomie déléguée (prouver, puis faire)

## Docs de référence

- `docs/ARCHITECTURE-TWOSTEP.md` — architecture d'ensemble
- `docs/SPEC/` — spec par maillon (M1-collecte → M9-onboarding) + `00-roadmap-nearst.md`
- `docs/pipeline-state.md` + `docs/os-architecture.md` — état du pipeline piloté par statut (convention OÙ/COMMENT)
- `docs/AUTONOMY.md`, `docs/autonomy-priorities.md` — fonctionnement de la boucle autonome
- `docs/REMOTION-QUALITY-CHECKLIST.md` — obligatoire avant tout Remotion (voir plus bas)

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **twostep-nextjs** (6021 symbols, 10612 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/twostep-nextjs/context` | Codebase overview, check index freshness |
| `gitnexus://repo/twostep-nextjs/clusters` | All functional areas |
| `gitnexus://repo/twostep-nextjs/processes` | All execution flows |
| `gitnexus://repo/twostep-nextjs/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Remotion / Motion Design — OBLIGATOIRE

**AVANT toute création de vidéo ou motion design avec Remotion**, lire et suivre OBLIGATOIREMENT :
`docs/REMOTION-QUALITY-CHECKLIST.md`

Ce document impose l'invocation de skills (brand, ui-ux-pro-max, design-system, viral-hook-generator) et de MCP (firecrawl, playwright, context7) AVANT d'écrire une seule ligne de code Remotion. Aucune exception.

## Mémoire persistante — LESSONS.md

Au démarrage de chaque session ET avant toute tâche non triviale :

1. LIS `LESSONS.md` à la racine du projet en entier.
2. Si la tâche ressemble à une entrée existante, suis la solution documentée.
3. Après avoir résolu un bug non trivial ou identifié une erreur récurrente, AJOUTE une entrée dans `LESSONS.md` avant de committer (ou utilise le slash command `/lesson`).
4. Format concis : 2-4 lignes par entrée maximum. Ce fichier doit rester sous 5 KB — le curer quand il dépasse (archive dans `docs/`).
