# LESSONS — Erreurs récurrentes et solutions

Mémoire long-terme — à lire en début de session. Curée 2026-07-10 ; détails : docs/LESSONS-archive-*.md.
Format : 2-4 lignes par entrée max. Fichier ≤ 5 KB : curer avant d'ajouter.

## Supabase — migrations & RPC
- DROP+CREATE FUNCTION réinitialise l'ACL → re-REVOKE dans la même migration. DDL sur fonction chaude : `lock_timeout='3s'` + heure creuse.
- Signature RPC : DROP+CREATE, jamais 2 overloads (PGRST203) ; toute `admin.rpc` existe en migration ; nouvel enum → grep le CHECK AVANT.
- Backfill de colonne dérivée : couvrir aussi les inserts FUTURS (trigger ou tous les `.insert`).
- RLS : base vide = faux négatif ; REVOKE colonne casse les policies cross-table (→ SECURITY DEFINER) ; re-tester en anon.

## Supabase — échelle
- SELECT non borné = troncature SILENCIEUSE à 1000 (`max-rows`) → `fetchAllRows`/`streamRows` (KEYSET, curseur UNIQUE NOT NULL, fail-loud). Grep aussi post-pass et crons.
- `.in()` → `chunk()` 500. UPDATE hétérogènes : grouper par forme de colonnes (upsert écrit l'UNION → null injecté), dédup PK intra-lot, repli mono-ligne.
- Cron : `maxDuration` + budget temps, statut « partial » + Sentry sur interruption, curseur de reprise persisté ; retry deadline-aware.

## Silent failures
- `const { data } =` qui jette `error` ; `data=null` SANS error = échec aussi (`?? []` le masque). Sur erreur de lecture, NE PAS écrire.
- Canal machine : erreur DB ≠ no-match → 500 (retry) ; PGRST116 = vrai no-match. SELECT de liste d'un cron avalé = tous les items perdus.
- Chemins JUMEAUX : gestion d'erreur identique ; celui qui diverge est le trou. Grep tous les writers/readers du champ.
- Symbole throwant : chaque catch caller → `captureError` (error.ts promeut PostgrestError). Compteurs = succès réels. Effet post-write webhook = non-fatal, jamais 500.

## Gates, feeds & vérification
- « verify » : jamais true sur erreur ; fail-CLOSED si publiable ; « pas pu vérifier » ≠ « vérifié OK ».
- Garde à l'APPLY → rejouée au PREVIEW/dryRun ET au READ → 1 helper unique. Timestamps DB en EPOCH ; horodatage déclaré : sanitiser + clamp futur.
- Verdict émis en JSON : PROJETER les champs publics. Lot RLS vide sans erreur ≠ « 0 stock » → trip-wire. 100 % rejeté ≠ ok.
- Défauts DB permissifs : tout insert produits pose le gate EXPLICITEMENT ; un chemin qui adopte l'identité HORS moteur de score → helper leaf.
- N canaux même tiers = MÊME ensemble émis (prédicat partagé) ; push async → read-back. Présence : `!== null && !== ""`. Rollup : no-op si vide.
- SKU local : scoper `merchant_id`. Clé externe (store_code, GTIN) : source UNIQUE.

## Parsing / données produit
- `Number(x) || défaut` détruit un 0 légitime → présence brute puis `Number.isFinite`.
- CSV POS FR = Windows-1252 → TextDecoder utf-8 `{fatal:true}` puis repli. Entités XML : `&amp;` en dernier. SKU lowercase des 2 côtés.
- Parseur LLM : LÈVE sur malformé ; marquer « tenté » sinon retry payant infini.
- EAN = IDENTITÉ seulement. Brand/catégorie : allow-list (0 invention), inconnu → null ; champ multi-valeur (OBF brands) : parser le FORMAT (tag primaire), helper unique tous writers ; pas d'acronyme ≤3 lettres.
- Coût API : cache négatif TTL écrit AVANT le spend ; gate aval à 100 % rejet → court-circuiter l'achat.

## Next.js / Vercel
- `vercel env add` stdin PowerShell = valeurs VIDES → `--value` + vérifier `env pull`. Script `prepare` casse le build Vercel → try/catch.
- Hot-reload turbopack rate parfois une lib d'une route API → redémarrer avant de conclure.
- Routing App Router invisible pour tsc → test route-contract ; jamais de `<Link>` vers une route API.

## UI client
- Fetch : gater `r.ok` ; garder `error` (échec ≠ vide) — vue, handlers, Server Components, hooks. États vides = porte de sortie.
- Verdict serveur s'AFFICHE, ne se recalcule pas. Dérivation d'état en helper PUR ; rendu visuel = l'œil de Thomas.

## Windows / environnement
- NetLimiter intercepte TLS → git SSH ; tests réseau isolés dans `test:db` ; le dev server e2e doit HÉRITER du contournement.
- winget ET npm installent Claude Code → maj les deux. `.ps1` planifié : ASCII ou UTF-8 BOM.
- Muter un fichier UTF-8 sans BOM via `Get-Content`/`Set-Content` PS 5.1 = double-encodage (mojibake) → passer par Edit/Write.

## Environnements partagés
- DB PARTAGÉE prod/branche : crons PROD (code main STALE) consomment les jobs insérés depuis la branche → preuve contaminée, gardes contournées. Compter ses jobs vs `processed_at`.
- Write-back au CACHE ≠ entité servie : champ découvert APRÈS application → RE-PROJETER sur le produit, gaté.

## Git / workflow / tests
- Jamais de commit sur main ; email git = bauland@twostep.fr ; `test:run` avant push ; chemins explicites (pas `git add -A`) ; au démarrage `git status` — du WIP sain se FINIT.
- Prouver une écriture = faux client Supabase STATEFUL ; dryRun ne prouve que les lectures ; webhooks : tester la ROUTE ; fix → grep la valeur dans `tests/`.
- ~70 % des findings de revue non vérifiés sont FAUX → vérifier au code réel ; prémisse d'un détecteur à valider en PROD ; watchdog : exclure les états DÉLIBÉRÉS.
- Outil payant : vérifier d'abord si la gratuité officielle suffit.
